# ml-service/trainModel.py
import os
import numpy as np
import pandas as pd
import json
from datetime import datetime

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

# ========================
# HELPER: MAPE Metric
# ========================
def mean_absolute_percentage_error(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    mask = y_true != 0
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
        processed_files = [f for f in all_files if "_processed" in f and f.endswith(".xlsx")]

        if merged_files:
            latest_merged = max(
                merged_files,
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
            print(f" Found merged 3-year dataset: {latest_merged}")
            return os.path.join(self.clean_path, latest_merged)
        elif processed_files:
            latest_processed = max(
                processed_files,
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
            print(f" Using latest processed file: {latest_processed}")
            return os.path.join(self.clean_path, latest_processed)
        else:
            raise FileNotFoundError("No processed or merged files found.")

    def load_data(self):
        file_path = self.get_merged_or_latest_file()
        print(f" Loading dataset: {file_path}")
        df = pd.read_excel(file_path)
        df = df.sort_values("Date")
        print(f" Dataset shape: {df.shape}")
        return df

class Normalizer:
    def __init__(self):
        self.mean = None
        self.std = None

    def fit(self, series):
        self.mean = float(series.mean())
        self.std = float(series.std())

    def transform(self, series):
        return (series - self.mean) / self.std

    def inverse(self, arr):
        return (arr * self.std) + self.mean


# ========================
# LSTM TRAINER
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
        print(" Normalizing sales data...")
        self.norm.fit(sales_series)
        data = self.norm.transform(sales_series).values.reshape(-1, 1)
        
        X, y = self.create_sequences(data)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        print(" Training optimized LSTM model...")
        model = Sequential([
            LSTM(128, return_sequences=False, input_shape=(X_train.shape[1], 1)),
            Dropout(0.3),
            Dense(64, activation='relu'),
            Dense(1)
        ])
        model.compile(optimizer="adam", loss="mse")

        es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True, verbose=1)

        model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=15, batch_size=64, verbose=1, callbacks=[es]
        )

        y_pred = model.predict(X_test)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mae = mean_absolute_error(y_test, y_pred)
        mape = mean_absolute_percentage_error(y_test, y_pred)

        print(f" LSTM Evaluation: RMSE={rmse:.2f}, MAE={mae:.2f}, MAPE={mape:.2f}%")

        self.model = model
        return model, {"RMSE": rmse, "MAE": mae, "MAPE": mape}

    def extract_features(self, sales_series):
        print(" Extracting LSTM temporal context features...")
        data = self.norm.transform(sales_series).values.reshape(-1, 1)

        X, _ = self.create_sequences(data)
        print(f"Extracting from {len(X)} sequences (lookback={self.lookback})")

        input_layer = Input(shape=(X.shape[1], 1))
        lstm_layer = self.model.layers[0]
        feature_extractor = Model(inputs=input_layer, outputs=lstm_layer(input_layer))

        features = feature_extractor.predict(X, verbose=1)
        padded_features = np.vstack([np.zeros((self.lookback, features.shape[1])), features])
        return padded_features


# ==========================
# XGBOOST TRAINER
# ==========================
class XGBoostTrainer:
    def train(self, X, y):
        print("Training optimized XGBoost model...")
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        model = xgb.XGBRegressor(
            n_estimators=400,
            learning_rate=0.03,
            max_depth=7,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.2,
            random_state=42,
            tree_method="hist",
            verbosity=0
        )

        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        rmse = np.sqrt(mean_squared_error(y_test, preds))
        mae = mean_absolute_error(y_test, preds)
        mape = mean_absolute_percentage_error(y_test, preds)

        print(f" XGBoost Evaluation: RMSE={rmse:.2f}, MAE={mae:.2f}, MAPE={mape:.2f}%")
        return model, {"RMSE": rmse, "MAE": mae, "MAPE": mape}


# ========================
# SALES FORECAST PIPELINE
# ========================
class SalesForecasterPipeline:
    def __init__(self, user_id):
        self.user_id = user_id
        self.data_loader = DataLoader(user_id)
        self.lstm_trainer = LSTMTrainer(lookback=90)
        self.xgb_trainer = XGBoostTrainer()

    def run(self):
        df = self.data_loader.load_data()
        print(" Preparing features...")
        sales_series = df["Total_Sales"]

        # 1. Train LSTM
        lstm_model, lstm_metrics = self.lstm_trainer.train(sales_series)
        temporal_features = self.lstm_trainer.extract_features(sales_series)

        # 2. Merge with static features
        feature_df = df.copy()
        for i in range(temporal_features.shape[1]):
            feature_df[f"LSTM_Feature_{i+1}"] = temporal_features[:, i]

        static_cols = [
            "Day_of_Week", "Month", "Week_of_Year",
            "Quarter", "Is_Weekend", "Promotion_Flag",
            "Rolling_7d_Sales", "Rolling_30d_Sales",
        ]
        feature_cols = static_cols + [f"LSTM_Feature_{i+1}" for i in range(temporal_features.shape[1])]
        X = feature_df[feature_cols].fillna(0)
        y = feature_df["Total_Sales"]

        # 3. Train XGBoost
        xgb_model, xgb_metrics = self.xgb_trainer.train(X, y)

        # 4. Save models
        user_model_dir = os.path.join(MODEL_DIR, f"user_{self.user_id}")
        os.makedirs(user_model_dir, exist_ok=True)

        lstm_path = os.path.join(user_model_dir, "lstm_model.keras")
        xgb_path = os.path.join(user_model_dir, "xgb_model.json")

        lstm_model.save(lstm_path)
        xgb_model.save_model(xgb_path)

        # Save normalization stats
        norm_stats = {
            "mean": float(self.lstm_trainer.norm.mean),
            "std": float(self.lstm_trainer.norm.std)
        }
        with open(os.path.join(user_model_dir, "norm_stats.json"), "w") as f:
            json.dump(norm_stats, f, indent=4)

        # 5. Enhanced Report: CSV + JSON + TXT
        report = {
            "User_ID": self.user_id,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "Dataset_Rows": len(df),
            "Lookback_Days": self.lstm_trainer.lookback,
            "LSTM": {
                "RMSE": float(lstm_metrics["RMSE"]),
                "MAE": float(lstm_metrics["MAE"]),
                "MAPE": float(lstm_metrics["MAPE"])
            },
            "XGBoost": {
                "RMSE": float(xgb_metrics["RMSE"]),
                "MAE": float(xgb_metrics["MAE"]),
                "MAPE": float(xgb_metrics["MAPE"])
            }
        }

        # Save CSV
        csv_path = os.path.join(REPORT_DIR, f"user_{self.user_id}_training_report.csv")
        pd.DataFrame([report]).to_csv(csv_path, index=False)

        # Save JSON (best for frontend)
        json_path = os.path.join(REPORT_DIR, f"user_{self.user_id}_training_report.json")
        with open(json_path, "w") as f:
            json.dump(report, f, indent=4)

        # Save readable TXT
        txt_path = os.path.join(REPORT_DIR, f"user_{self.user_id}_training_report.txt")
        with open(txt_path, "w") as f:
            f.write(f"Sales Forecasting Training Report - User {self.user_id}\n")
            f.write("=" * 60 + "\n")
            f.write(f"Trained on      : {report['Timestamp']}\n")
            f.write(f"Dataset size    : {report['Dataset_Rows']} days\n\n")
            f.write(f"LSTM  → RMSE: {report['LSTM']['RMSE']:.2f} | MAE: {report['LSTM']['MAE']:.2f} | MAPE: {report['LSTM']['MAPE']:.2f}%\n")
            f.write(f"XGB   → RMSE: {report['XGBoost']['RMSE']:.2f} | MAE: {report['XGBoost']['MAE']:.2f} | MAPE: {report['XGBoost']['MAPE']:.2f}%\n")

        print(f"\nTraining Completed Successfully for User {self.user_id}!")
        print(f"Models saved → {user_model_dir}")
        print(f"Reports:")
        print(f"   CSV  → {csv_path}")
        print(f"   JSON → {json_path}")
        print(f"   TXT  → {txt_path}")
        print("Model is ready for forecasting!\n")


# ========================
# MAIN ENTRY POINT
# ========================
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python trainModel.py <user_id>")
        print("Example: python trainModel.py 3")
        sys.exit(1)

    user_id = sys.argv[1]
    pipeline = SalesForecasterPipeline(user_id)
    pipeline.run()