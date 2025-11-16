# ml-service/trainModel.py (REFACTORED FOR PRODUCT-LEVEL FORECASTING)

import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
import numpy as np
import pandas as pd
import json
from datetime import datetime

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from tensorflow.keras import Input
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error

# ========================
# CONFIGURATION
# ========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

MIN_SAMPLES_REQUIRED = 180  # Minimum 6 months of data per product
LOOKBACK = 90  # 90-day lookback for LSTM

# ========================
# HELPER: MAPE Metric
# ========================
def mean_absolute_percentage_error(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    mask = y_true != 0
    if np.sum(mask) == 0:
        return 0.0
    return np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100

# ========================
# DATA LOADER
# ========================
class DataLoader:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.clean_path = os.path.abspath(os.path.join(CLEAN_DIR, f"user_{user_id}"))
        if not os.path.exists(self.clean_path):
            raise FileNotFoundError(f"No cleaned data found for user {user_id}")

    def get_merged_or_latest_file(self):
        all_files = os.listdir(self.clean_path)
        merged_files = [f for f in all_files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
        
        if merged_files:
            latest_merged = max(
                merged_files,
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
            print(f"Found merged 3-year dataset: {latest_merged}")
            return os.path.join(self.clean_path, latest_merged)
        else:
            raise FileNotFoundError("No merged 3-year dataset found. Upload 3 years of data first.")

    def load_data(self):
        file_path = self.get_merged_or_latest_file()
        print(f"Loading dataset: {file_path}")
        df = pd.read_excel(file_path)
        df = df.sort_values(["Product_ID", "Date"]).reset_index(drop=True)
        print(f"Dataset shape: {df.shape}")
        print(f"Unique products: {df['Product_ID'].nunique()}")
        return df


class Normalizer:
    def __init__(self):
        self.mean = None
        self.std = None

    def fit(self, series):
        self.mean = float(series.mean())
        self.std = float(series.std()) if series.std() > 0 else 1.0

    def transform(self, series):
        return (series - self.mean) / self.std

    def inverse(self, arr):
        return (arr * self.std) + self.mean


# ========================
# LSTM TRAINER (PER PRODUCT)
# ========================
class LSTMTrainer:
    def __init__(self, lookback=90):
        self.lookback = lookback
        self.model = None
        self.norm = Normalizer()

    def create_sequences(self, data):
        X, y = [], []
        for i in range(self.lookback, len(data)):
            X.append(data[i - self.lookback:i])
            y.append(data[i])
        return np.array(X), np.array(y)

    def train(self, sales_series):
        if len(sales_series) < self.lookback + 30:
            raise ValueError(f"Insufficient data: {len(sales_series)} samples (need {self.lookback + 30})")
        
        print(f"Normalizing {len(sales_series)} samples...")
        self.norm.fit(sales_series)
        data = self.norm.transform(sales_series).values.reshape(-1, 1)
        
        X, y = self.create_sequences(data)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        print(f"Training LSTM (train={len(X_train)}, test={len(X_test)})...")
        model = Sequential([
            Input(shape=(X_train.shape[1], 1)),
            LSTM(64, return_sequences=False),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(1)
        ])
        model.compile(optimizer="adam", loss="mse")

        es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True, verbose=0)

        model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=10, batch_size=32, verbose=0, callbacks=[es]
        )

        y_pred = model.predict(X_test, verbose=0)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mae = mean_absolute_error(y_test, y_pred)
        mape = mean_absolute_percentage_error(y_test, y_pred)

        print(f"LSTM Metrics: RMSE={rmse:.4f}, MAE={mae:.4f}, MAPE={mape:.2f}%")

        self.model = model
        return model, {"RMSE": float(rmse), "MAE": float(mae), "MAPE": float(mape)}

    def extract_features(self, sales_series):
        data = self.norm.transform(sales_series).values.reshape(-1, 1)
        X, _ = self.create_sequences(data)

        input_layer = Input(shape=(X.shape[1], 1))
        lstm_layer = self.model.layers[0]
        feature_extractor = Model(inputs=input_layer, outputs=lstm_layer(input_layer))

        features = feature_extractor.predict(X, verbose=0)
        padded_features = np.vstack([np.zeros((self.lookback, features.shape[1])), features])
        return padded_features


# ==========================
# XGBOOST TRAINER (PER PRODUCT)
# ==========================
class XGBoostTrainer:
    def train(self, X, y):
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        print(f"Training XGBoost (train={len(X_train)}, test={len(X_test)})...")
        model = xgb.XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
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

        rmse = np.sqrt(mean_squared_error(y_test, preds))
        mae = mean_absolute_error(y_test, preds)
        mape = mean_absolute_percentage_error(y_test, preds)

        print(f"XGBoost Metrics: RMSE={rmse:.2f}, MAE={mae:.2f}, MAPE={mape:.2f}%")
        return model, {"RMSE": float(rmse), "MAE": float(mae), "MAPE": float(mape)}


# ========================
# PRODUCT-LEVEL PIPELINE
# ========================
class ProductForecasterPipeline:
    def __init__(self, user_id):
        self.user_id = user_id
        self.data_loader = DataLoader(user_id)
        self.lookback = 90

    def run(self):
        df = self.data_loader.load_data()
        
        # Get list of products with sufficient data
        product_counts = df.groupby("Product_ID").size()
        valid_products = product_counts[product_counts >= MIN_SAMPLES_REQUIRED].index.tolist()
        
        print(f"\nProducts with sufficient data ({MIN_SAMPLES_REQUIRED}+ samples): {len(valid_products)}")
        print(f"Skipped products (insufficient data): {len(product_counts) - len(valid_products)}\n")
        
        all_reports = []
        user_model_dir = os.path.join(MODEL_DIR, f"user_{self.user_id}")
        os.makedirs(user_model_dir, exist_ok=True)
        
        for product_id in valid_products:
            product_df = df[df["Product_ID"] == product_id].copy()
            product_name = product_df["Product_Name"].iloc[0]
            category = product_df["Category"].iloc[0]
            
            print(f"{'='*60}")
            print(f"Training model for: {product_name} (ID: {product_id})")
            print(f"Category: {category} | Samples: {len(product_df)}")
            
            try:
                # Train LSTM
                lstm_trainer = LSTMTrainer(lookback=self.lookback)
                sales_series = product_df["Units_Sold"]
                lstm_model, lstm_metrics = lstm_trainer.train(sales_series)
                temporal_features = lstm_trainer.extract_features(sales_series)
                
                # Merge features
                feature_df = product_df.copy()
                for i in range(temporal_features.shape[1]):
                    feature_df[f"LSTM_Feature_{i+1}"] = temporal_features[:, i]
                
                static_cols = [
                    "Day_of_Week", "Month", "Week_of_Year",
                    "Quarter", "Is_Weekend", "Promotion_Flag",
                    "Rolling_7d_Sales", "Rolling_30d_Sales",
                ]
                feature_cols = static_cols + [f"LSTM_Feature_{i+1}" for i in range(temporal_features.shape[1])]
                X = feature_df[feature_cols].fillna(0)
                y = feature_df["Units_Sold"]
                
                # Train XGBoost
                xgb_trainer = XGBoostTrainer()
                xgb_model, xgb_metrics = xgb_trainer.train(X, y)
                
                # Save product-specific models
                product_model_dir = os.path.join(user_model_dir, f"product_{product_id}")
                os.makedirs(product_model_dir, exist_ok=True)
                
                lstm_path = os.path.join(product_model_dir, "lstm_model.keras")
                xgb_path = os.path.join(product_model_dir, "xgb_model.json")
                
                lstm_model.save(lstm_path)
                xgb_model.save_model(xgb_path)
                
                # Save normalization stats
                norm_stats = {
                    "mean": lstm_trainer.norm.mean,
                    "std": lstm_trainer.norm.std,
                    "lookback": self.lookback,
                    "product_id": str(product_id),
                    "product_name": product_name,
                    "category": category,
                    "avg_unit_price": float(product_df["Avg_Unit_Price"].mean()),  # ← ADD THIS
                    "total_samples": len(product_df)
                }
                with open(os.path.join(product_model_dir, "norm_stats.json"), "w") as f:
                    json.dump(norm_stats, f, indent=4)
                
                print(f" Models saved to: {product_model_dir}\n")
                
                # Collect report
                all_reports.append({
                    "User_ID": self.user_id,
                    "Product_ID": product_id,
                    "Product_Name": product_name,
                    "Category": category,
                    "Samples": len(product_df),
                    "LSTM_RMSE": lstm_metrics["RMSE"],
                    "LSTM_MAE": lstm_metrics["MAE"],
                    "LSTM_MAPE": lstm_metrics["MAPE"],
                    "XGB_RMSE": xgb_metrics["RMSE"],
                    "XGB_MAE": xgb_metrics["MAE"],
                    "XGB_MAPE": xgb_metrics["MAPE"],
                    "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
                
            except Exception as e:
                print(f"  Failed to train {product_name}: {str(e)}\n")
                continue
        
        # Save consolidated report
        if all_reports:
            report_path = os.path.join(REPORT_DIR, f"user_{self.user_id}_training_report.csv")
            pd.DataFrame(all_reports).to_csv(report_path, index=False)
            print(f"\n{'='*60}")
            print(f"Training completed for {len(all_reports)} products")
            print(f"Report saved: {report_path}")
            print(f"Models ready for product-level forecasting!\n")
        else:
            print("\nNo models were trained successfully.")


# ========================
# MAIN ENTRY POINT
# ========================
if __name__ == "__main__":
    import sys

    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not user_id:
        raise ValueError("Usage: python trainModel.py <user_id>")

    pipeline = ProductForecasterPipeline(user_id)
    pipeline.run()