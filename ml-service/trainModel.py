# ml-service/trainModel.py
import os
import numpy as np
import pandas as pd
from datetime import datetime

from tensorflow.keras import Input
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error


# ========================
# CONFIGURATION
# ========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")


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
        """
        Automatically detects if a merged 3-year dataset exists.
        If yes → use it.
        Otherwise → fall back to the latest processed file.
        """
        all_files = os.listdir(self.clean_path)
        merged_files = [f for f in all_files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
        processed_files = [f for f in all_files if "_processed" in f and f.endswith(".xlsx")]

        # ✅ Prefer merged multi-year file
        if merged_files:
            latest_merged = max(
                merged_files,
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
            print(f" Found merged 3-year dataset: {latest_merged}")
            return os.path.join(self.clean_path, latest_merged)

        # ⚠️ Fallback if no merged file
        if not processed_files:
            raise FileNotFoundError(f"No processed sales data available in {self.clean_path}")
        latest = max(processed_files, key=lambda f: os.path.getctime(os.path.join(self.clean_path, f)))
        print(f" No merged 3-year file found, using latest processed file: {latest}")
        return os.path.join(self.clean_path, latest)

    def load_data(self):
        file_path = self.get_merged_or_latest_file()
        print(f" Loading dataset: {file_path}")
        df = pd.read_excel(file_path)
        df = df.sort_values("Date")
        print(f" Dataset shape: {df.shape}")
        return df


# ========================
# LSTM TRAINER
# ========================
class LSTMTrainer:
    def __init__(self, lookback=30):
        self.lookback = lookback
        self.model = None

    def create_sequences(self, data):
        X, y = [], []
        for i in range(self.lookback, len(data)):
            X.append(data[i - self.lookback:i])
            y.append(data[i])
        return np.array(X), np.array(y)

    def train(self, sales_series):
        print(" Training LSTM model...")
        data = sales_series.values.reshape(-1, 1)
        X, y = self.create_sequences(data)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        model = Sequential([
            LSTM(64, return_sequences=False, input_shape=(X_train.shape[1], 1)),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(1)
        ])
        model.compile(optimizer="adam", loss="mse")
        es = EarlyStopping(patience=5, restore_best_weights=True)

        model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=30, batch_size=32, verbose=1, callbacks=[es]
        )

        y_pred = model.predict(X_test)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        print(f" LSTM RMSE: {rmse:.4f}")
        self.model = model
        return model

    def extract_features(self, sales_series):
        """
        Feed the full series through the trained LSTM and extract hidden states
        as temporal context features.
        """
        print(" Extracting LSTM temporal context features...")
        data = sales_series.values.reshape(-1, 1)
        X, _ = self.create_sequences(data)
        print(f"Extracting from {len(X)} sequences (lookback={self.lookback})")

        input_layer = Input(shape=(X.shape[1], 1))
        lstm_layer = self.model.layers[0]
        feature_extractor = Model(inputs=input_layer, outputs=lstm_layer(input_layer))

        features = feature_extractor.predict(X, verbose=1)
        padded_features = np.vstack([np.zeros((self.lookback, features.shape[1])), features])
        return padded_features


# ========================
# XGBOOST TRAINER
# ========================
class XGBoostTrainer:
    def train(self, X, y):
        print(" Training XGBoost model...")
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        model = xgb.XGBRegressor(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )

        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        print(f" XGBoost RMSE: {rmse:.4f}")
        return model


# ========================
# SALES FORECAST PIPELINE
# ========================
class SalesForecasterPipeline:
    def __init__(self, user_id):
        self.user_id = user_id
        self.data_loader = DataLoader(user_id)
        self.lstm_trainer = LSTMTrainer(lookback=30)
        self.xgb_trainer = XGBoostTrainer()

    def run(self):
        df = self.data_loader.load_data()

        print(" Preparing features...")
        sales_series = df["Total_Sales"]

        # 1️⃣ Train LSTM
        lstm_model = self.lstm_trainer.train(sales_series)
        temporal_features = self.lstm_trainer.extract_features(sales_series)

        # 2️⃣ Merge with static features
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

        # 3️⃣ Train XGBoost
        xgb_model = self.xgb_trainer.train(X, y)

        # 4️⃣ Save models
        user_model_dir = os.path.join(MODEL_DIR, f"user_{self.user_id}")
        os.makedirs(user_model_dir, exist_ok=True)

        lstm_path = os.path.join(user_model_dir, "lstm_model.keras")
        xgb_path = os.path.join(user_model_dir, "xgb_model.json")

        lstm_model.save(lstm_path)  # ✅ Use modern Keras format
        xgb_model.save_model(xgb_path)

        print(f" Models saved:\n - {lstm_path}\n - {xgb_path}")
        print(" Training pipeline completed successfully!")


# ========================
# MAIN ENTRY POINT
# ========================
if __name__ == "__main__":
    import sys

    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not user_id:
        raise ValueError("User ID must be provided, e.g. `python trainModel.py 3`")

    pipeline = SalesForecasterPipeline(user_id)
    pipeline.run()
