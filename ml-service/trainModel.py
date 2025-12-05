# ml-service/trainModel.py
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import json
import io
import sys
from datetime import datetime
from functools import partial
from typing import List, Tuple, Dict

import numpy as np
import pandas as pd

# Ensure stdout encoding stable in many environments
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ML libraries
from tensorflow.keras import Input
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error

# Parallel training
from concurrent.futures import ThreadPoolExecutor, as_completed

# ========================
# CONFIGURATION
# ========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

# Minimum dataset / lookback
MIN_SAMPLES_REQUIRED = 180    # ~6 months daily
LOOKBACK = 90                # LSTM lookback window

# BACKTEST CONFIG
BACKTEST_CONFIG = {
    "enabled": True,
    "test_window_days": 90,   # length of validation window per fold (rows)
    "max_folds": 2, 
    "min_train_samples": LOOKBACK + 30,  # minimum samples to backtest
}

# TRAINING / PERFORMANCE TUNING
TRAINING = {
    "lstm_epochs": 5,
    "lstm_batch_size": 32,
    "xgb_n_estimators": 150,
    "xgb_lr": 0.05,
    "workers": 4,  # parallel products; tune to your CPU
}

# ========================
# UTIL / METRICS
# ========================
def mean_absolute_percentage_error(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    mask = y_true != 0
    if np.sum(mask) == 0:
        return 0.0
    return np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100.0

def rmse(y_true, y_pred):
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))

def mae(y_true, y_pred):
    return float(mean_absolute_error(y_true, y_pred))

# ========================
# DATA LOADER
# ========================
class DataLoader:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self.clean_path = os.path.abspath(os.path.join(CLEAN_DIR, f"user_{self.user_id}"))
        if not os.path.exists(self.clean_path):
            raise FileNotFoundError(f"No cleaned data found for user {user_id}")

    def get_merged_or_latest_file(self) -> str:
        files = os.listdir(self.clean_path)
        merged_files = [f for f in files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
        if merged_files:
            latest_merged = max(merged_files, key=lambda f: os.path.getctime(os.path.join(self.clean_path, f)))
            return os.path.join(self.clean_path, latest_merged)

        processed_files = [f for f in files if "_processed_" in f and f.endswith(".xlsx")]
        if not processed_files:
            raise FileNotFoundError(f"No processed files found for user {self.user_id}")
        latest = max(processed_files, key=lambda f: os.path.getctime(os.path.join(self.clean_path, f)))
        return os.path.join(self.clean_path, latest)

    def load_data(self) -> pd.DataFrame:
        path = self.get_merged_or_latest_file()
        print(f"[DataLoader] Loading dataset: {path}")
        df = pd.read_excel(path)
        df = df.sort_values(["Product_ID", "Date"]).reset_index(drop=True)
        print(f"[DataLoader] shape={df.shape}, products={df['Product_ID'].nunique()}")
        return df

# ========================
# NORMALIZER
# ========================
class Normalizer:
    def __init__(self):
        self.mean = 0.0
        self.std = 1.0

    def fit(self, series: pd.Series):
        self.mean = float(series.mean())
        self.std = float(series.std()) if series.std() > 0 else 1.0

    def transform(self, series: pd.Series) -> pd.Series:
        return (series - self.mean) / self.std

    def inverse(self, arr: np.ndarray) -> np.ndarray:
        return (arr * self.std) + self.mean

# ========================
# LSTM TRAINER
# ========================
class LSTMTrainer:
    def __init__(self, lookback=LOOKBACK, epochs=None, batch_size=None):
        self.lookback = lookback
        self.model = None
        self.norm = Normalizer()
        self.epochs = epochs if epochs is not None else TRAINING["lstm_epochs"]
        self.batch_size = batch_size if batch_size is not None else TRAINING["lstm_batch_size"]

    def create_sequences(self, arr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        X, y = [], []
        for i in range(self.lookback, len(arr)):
            X.append(arr[i - self.lookback:i])
            y.append(arr[i])
        return np.array(X), np.array(y)

    def _build_model(self, input_steps: int):
        model = Sequential([
            Input(shape=(input_steps, 1)),
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            Dense(32, activation="relu"),
            Dense(1)
        ])
        model.compile(optimizer="adam", loss="mse")
        return model

    def train(self, sales_series: pd.Series) -> Tuple[Sequential, Dict]:
        n = len(sales_series)
        if n < self.lookback + 30:
            raise ValueError(f"Insufficient data ({n}) for lookback {self.lookback}")

        # fit normalizer on full series (for final training we want consistent scaling)
        self.norm.fit(sales_series)
        normalized = self.norm.transform(sales_series).values.reshape(-1, 1)

        X, y = self.create_sequences(normalized)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        model = self._build_model(X_train.shape[1])
        es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True, verbose=0)

        model.fit(X_train, y_train, validation_data=(X_test, y_test),
                  epochs=self.epochs, batch_size=self.batch_size, verbose=0, callbacks=[es])

        preds = model.predict(X_test, verbose=0)
        metrics = {
            "RMSE": rmse(y_test, preds),
            "MAE": mae(y_test, preds),
            "MAPE": mean_absolute_percentage_error(y_test.flatten(), preds.flatten())
        }

        self.model = model
        return model, metrics

    def train_on_splits(self, sales_series: pd.Series, train_idx_end: int, val_idx_start: int, val_idx_end: int) -> Dict:
        # train_idx_end, val_* are indices in original series (0..n-1)
        n = len(sales_series)
        if val_idx_end >= n:
            raise ValueError("Validation end index out of range")

        # fit normalizer on train portion only
        train_series = sales_series.iloc[: train_idx_end + 1]
        self.norm.fit(train_series)

        normalized = self.norm.transform(sales_series).values.reshape(-1, 1)
        X_all, y_all = self.create_sequences(normalized)
        seq_target_positions = np.arange(self.lookback, n)

        train_mask = seq_target_positions <= train_idx_end
        val_mask = (seq_target_positions >= val_idx_start) & (seq_target_positions <= val_idx_end)

        if not train_mask.any() or not val_mask.any():
            raise ValueError("Empty train/val masks for provided indices")

        X_train = X_all[train_mask]
        y_train = y_all[train_mask]
        X_val = X_all[val_mask]
        y_val = y_all[val_mask]

        model = self._build_model(X_train.shape[1])
        es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True, verbose=0)

        model.fit(X_train, y_train, validation_data=(X_val, y_val),
                  epochs=self.epochs, batch_size=self.batch_size, verbose=0, callbacks=[es])

        preds = model.predict(X_val, verbose=0)
        metrics = {
            "RMSE": rmse(y_val, preds),
            "MAE": mae(y_val, preds),
            "MAPE": mean_absolute_percentage_error(y_val.flatten(), preds.flatten())
        }

        # store the model + normalizer so we can extract features if needed
        self.model = model
        return metrics

    def extract_features(self, sales_series: pd.Series) -> np.ndarray:
        if self.model is None:
            raise ValueError("LSTM model is not trained (call train or train_on_splits first)")

        normalized = self.norm.transform(sales_series).values.reshape(-1, 1)
        X, _ = self.create_sequences(normalized)
        # build extractor to get hidden outputs from first LSTM layer
        lstm_layer = self.model.layers[0]
        input_shape = self.model.input_shape[1:]
        input_layer = Input(shape=input_shape)
        features_output = lstm_layer(input_layer, training=False)
        extractor = Model(inputs=input_layer, outputs=features_output)
        extractor.make_predict_function()
        feats = extractor.predict(X, verbose=0)
        padded = np.vstack([np.zeros((self.lookback, feats.shape[1])), feats])
        return padded

# ========================
# XGBOOST TRAINER
# ========================
class XGBoostTrainer:
    def __init__(self, n_estimators=None, learning_rate=None):
        self.n_estimators = n_estimators if n_estimators is not None else TRAINING["xgb_n_estimators"]
        self.learning_rate = learning_rate if learning_rate is not None else TRAINING["xgb_lr"]

    def train(self, X: pd.DataFrame, y: pd.Series) -> Tuple[xgb.XGBRegressor, Dict]:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
        model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            random_state=42,
            tree_method="hist",
            verbosity=0
        )
        model.fit(X_train, y_train, verbose=False)
        preds = model.predict(X_test)
        metrics = {
            "RMSE": rmse(y_test, preds),
            "MAE": mae(y_test, preds),
            "MAPE": mean_absolute_percentage_error(y_test, preds)
        }
        return model, metrics

    def train_on_splits(self, X: pd.DataFrame, y: pd.Series, train_mask: np.ndarray, val_mask: np.ndarray) -> Tuple[xgb.XGBRegressor, Dict]:
        X_train = X[train_mask].fillna(0)
        y_train = y[train_mask]
        X_val = X[val_mask].fillna(0)
        y_val = y[val_mask]

        if len(X_train) == 0 or len(X_val) == 0:
            raise ValueError("Empty train/val split for XGBoost")

        model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            random_state=42,
            tree_method="hist",
            verbosity=0
        )
        model.fit(X_train, y_train, verbose=False)
        preds = model.predict(X_val)
        metrics = {
            "RMSE": rmse(y_val, preds),
            "MAE": mae(y_val, preds),
            "MAPE": mean_absolute_percentage_error(y_val, preds)
        }
        return model, metrics

# ========================
# BACKTESTER
# ========================
class Backtester:
    def __init__(self, lookback=LOOKBACK, test_window=BACKTEST_CONFIG["test_window_days"], max_folds=BACKTEST_CONFIG["max_folds"]):
        self.lookback = lookback
        self.test_window = test_window
        self.max_folds = max_folds

    def make_splits(self, df_product: pd.DataFrame) -> List[Tuple[int, int, int]]:
        n = len(df_product)
        if n < BACKTEST_CONFIG["min_train_samples"]:
            return []

        folds = []
        last_idx = n - 1
        val_end = last_idx

        for _ in range(self.max_folds):
            val_start = val_end - (self.test_window - 1)
            if val_start <= self.lookback:
                break
            train_end = val_start - 1
            if train_end + 1 < BACKTEST_CONFIG["min_train_samples"]:
                break
            folds.append((train_end, val_start, val_end))
            val_end = val_start - 1

        # return in chronological order (old -> new), which is natural expanding-window
        return list(reversed(folds))

    def run_backtest_for_product(self, product_df: pd.DataFrame, product_id: str) -> List[Dict]:
        folds = self.make_splits(product_df)
        if not folds:
            print(f"  [Backtester] Not enough data/folds for {product_id}")
            return []

        results = []
        sales_series = product_df["Units_Sold"].astype(float).reset_index(drop=True)

        for fold_i, (train_end, val_start, val_end) in enumerate(folds, start=1):
            print(f"  [Backtester] Fold {fold_i} train_end={train_end} val=({val_start}-{val_end})")
            # Train LSTM on this fold
            lstm = LSTMTrainer(lookback=self.lookback)
            try:
                lstm_metrics = lstm.train_on_splits(sales_series, train_end, val_start, val_end)
            except Exception as e:
                print(f"   ⚠️ LSTM fold failure ({product_id}): {e}")
                continue

            # Extract LSTM features for full product_df using trained fold model + normalizer
            try:
                features = lstm.extract_features(sales_series)  # padded features aligned to series length
            except Exception as e:
                print(f"   ⚠️ Feature extraction failed ({product_id}): {e}")
                # fallback zeros
                features = np.zeros((len(sales_series), 1))

            # Build feature_df mimicking training pipeline
            feature_df = product_df.copy().reset_index(drop=True)
            for i in range(features.shape[1]):
                feature_df[f"LSTM_Feature_{i+1}"] = features[:, i]
            static_cols = [
                "Day_of_Week", "Month", "Week_of_Year",
                "Quarter", "Is_Weekend", "Promotion_Flag",
                "Rolling_7d_Sales", "Rolling_30d_Sales",
            ]
            feature_cols = static_cols + [c for c in feature_df.columns if c.startswith("LSTM_Feature_")]
            X_all = feature_df[feature_cols].fillna(0)
            y_all = product_df["Units_Sold"].astype(float)

            train_mask = np.zeros(len(X_all), dtype=bool)
            val_mask = np.zeros(len(X_all), dtype=bool)
            train_mask[:train_end + 1] = True
            val_mask[val_start: val_end + 1] = True

            xgb = XGBoostTrainer()
            try:
                _, xgb_metrics = xgb.train_on_splits(X_all, y_all, train_mask, val_mask)
            except Exception as e:
                print(f"   ⚠️ XGB fold failure ({product_id}): {e}")
                continue

            results.append({
                "fold": int(fold_i),
                "train_end_idx": int(train_end),
                "val_start_idx": int(val_start),
                "val_end_idx": int(val_end),
                "LSTM": lstm_metrics,
                "XGB": xgb_metrics
            })

        return results

# ========================
# PRODUCT-LEVEL PIPELINE (parallelized)
# ========================
class ProductForecasterPipeline:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self.data_loader = DataLoader(self.user_id)
        self.lookback = LOOKBACK
        self.user_model_dir = os.path.join(MODEL_DIR, f"user_{self.user_id}")
        os.makedirs(self.user_model_dir, exist_ok=True)
        self.user_report_dir = os.path.join(REPORT_DIR, f"user_{self.user_id}")
        os.makedirs(self.user_report_dir, exist_ok=True)

    def _train_product(self, product_id: str, product_df: pd.DataFrame) -> Dict:
        product_df = product_df.sort_values("Date").reset_index(drop=True)
        product_name = product_df["Product_Name"].iloc[0] if "Product_Name" in product_df.columns else f"product_{product_id}"
        category = product_df["Category"].iloc[0] if "Category" in product_df.columns else "Unknown"
        n_samples = len(product_df)

        report = {
            "User_ID": self.user_id,
            "Product_ID": product_id,
            "Product_Name": product_name,
            "Category": category,
            "Samples": n_samples,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        try:
            print(f"\n=== Product {product_name} ({product_id}) samples={n_samples} ===")
            fold_metrics = []
            if BACKTEST_CONFIG["enabled"]:
                print(" Running backtest ...")
                backtester = Backtester(lookback=self.lookback, test_window=BACKTEST_CONFIG["test_window_days"], max_folds=BACKTEST_CONFIG["max_folds"])
                fold_metrics = backtester.run_backtest_for_product(product_df, product_id)
                # save backtest details
                backtest_path = os.path.join(self.user_report_dir, f"product_{product_id}_backtest.json")
                with open(backtest_path, "w", encoding="utf-8") as f:
                    json.dump({"product_id": str(product_id), "product_name": product_name, "folds": fold_metrics}, f, indent=2, default=str)

            # fold summary if available
            if fold_metrics:
                def _avg_metric(block, key):
                    vals = [f[block][key] for f in fold_metrics if block in f and key in f[block]]
                    return float(np.mean(vals)) if vals else None
                report.update({
                    "LSTM_Backtest_RMSE": _avg_metric("LSTM", "RMSE"),
                    "LSTM_Backtest_MAE": _avg_metric("LSTM", "MAE"),
                    "LSTM_Backtest_MAPE": _avg_metric("LSTM", "MAPE"),
                    "XGB_Backtest_RMSE": _avg_metric("XGB", "RMSE"),
                    "XGB_Backtest_MAE": _avg_metric("XGB", "MAE"),
                    "XGB_Backtest_MAPE": _avg_metric("XGB", "MAPE"),
                })
            else:
                report.update({
                    "LSTM_Backtest_RMSE": None,
                    "LSTM_Backtest_MAE": None,
                    "LSTM_Backtest_MAPE": None,
                    "XGB_Backtest_RMSE": None,
                    "XGB_Backtest_MAE": None,
                    "XGB_Backtest_MAPE": None,
                })

            # Final training on full data
            print(" Training final LSTM on full dataset ...")
            lstm_trainer = LSTMTrainer(lookback=self.lookback)
            sales_series = product_df["Units_Sold"].astype(float)
            lstm_model, lstm_metrics = lstm_trainer.train(sales_series)

            # Extract temporal features for every row
            temporal_features = lstm_trainer.extract_features(sales_series)

            # Build feature_df for xgboost
            feature_df = product_df.copy().reset_index(drop=True)
            for i in range(temporal_features.shape[1]):
                feature_df[f"LSTM_Feature_{i+1}"] = temporal_features[:, i]

            static_cols = [
                "Day_of_Week", "Month", "Week_of_Year",
                "Quarter", "Is_Weekend", "Promotion_Flag",
                "Rolling_7d_Sales", "Rolling_30d_Sales",
            ]
            feature_cols = [c for c in static_cols if c in feature_df.columns] + [c for c in feature_df.columns if c.startswith("LSTM_Feature_")]
            X = feature_df[feature_cols].fillna(0)
            y = product_df["Units_Sold"].astype(float)

            print(" Training final XGBoost on full dataset ...")
            xgb_trainer = XGBoostTrainer()
            xgb_model, xgb_metrics = xgb_trainer.train(X, y)

            # Save models + norm stats
            product_model_dir = os.path.join(self.user_model_dir, f"product_{product_id}")
            os.makedirs(product_model_dir, exist_ok=True)
            lstm_path = os.path.join(product_model_dir, "lstm_model.keras")
            xgb_path = os.path.join(product_model_dir, "xgb_model.json")

            lstm_model.save(lstm_path)
            xgb_model.save_model(xgb_path)

            norm_stats = {
                "mean": lstm_trainer.norm.mean,
                "std": lstm_trainer.norm.std,
                "lookback": self.lookback,
                "product_id": str(product_id),
                "product_name": product_name,
                "category": category,
                "avg_unit_price": float(product_df["Avg_Unit_Price"].mean()) if "Avg_Unit_Price" in product_df.columns else 0.0,
                "total_samples": n_samples
            }
            with open(os.path.join(product_model_dir, "norm_stats.json"), "w", encoding="utf-8") as f:
                json.dump(norm_stats, f, indent=2)

            # Fill report with metrics (prefer backtest summary where present)
            report.update({
                "LSTM_RMSE": lstm_metrics["RMSE"],
                "LSTM_MAE": lstm_metrics["MAE"],
                "LSTM_MAPE": lstm_metrics["MAPE"],
                "XGB_RMSE": xgb_metrics["RMSE"],
                "XGB_MAE": xgb_metrics["MAE"],
                "XGB_MAPE": xgb_metrics["MAPE"],
            })

            print(f" Saved models for product {product_id} -> {product_model_dir}")
            return report

        except Exception as e:
            print(f"  ✖ Failed product {product_id}: {e}")
            report["error"] = str(e)
            return report

    def run(self):
        df = self.data_loader.load_data()
        product_groups = df.groupby("Product_ID")
        product_counts = product_groups.size()
        valid_products = product_counts[product_counts >= MIN_SAMPLES_REQUIRED].index.tolist()

        print(f"\nProducts with sufficient data: {len(valid_products)} (required >= {MIN_SAMPLES_REQUIRED})")
        all_reports = []

        # Prepare tasks
        tasks = []
        with ThreadPoolExecutor(max_workers=TRAINING["workers"]) as exe:
            futures = {}
            for pid in valid_products:
                p_df = product_groups.get_group(pid).copy()
                futures[exe.submit(self._train_product, pid, p_df)] = pid

            for fut in as_completed(futures):
                res = fut.result()
                all_reports.append(res)

        # Save consolidated CSV report
        if all_reports:
            report_path = os.path.join(REPORT_DIR, f"user_{self.user_id}_training_report.csv")
            pd.DataFrame(all_reports).to_csv(report_path, index=False)
            print(f"\nTraining completed for {len(all_reports)} products. Report saved: {report_path}")
        else:
            print("\nNo products were successfully trained.")

# ========================
# MAIN
# ========================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise ValueError("Usage: python trainModel.py <user_id>")

    user_id = sys.argv[1]
    pipeline = ProductForecasterPipeline(user_id)
    pipeline.run()
