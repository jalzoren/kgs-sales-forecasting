# ml-service/forecastModel.py
"""
Forecast generation script for hybrid LSTM + XGBoost model.

Usage:
    python forecastModel.py <user_id> [--horizon DAYS]
Example:
    python forecastModel.py 3 --horizon 90

Outputs:
    ../backend/files/forecastData/user_{user_id}/sales_forecast_{timestamp}.xlsx
    Contains sheets: 'daily_forecast', 'weekly_summary', 'monthly_summary', '3month_summary'
"""

import os
import sys
import argparse
import json
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from tensorflow.keras.models import load_model
from tensorflow.keras import Input, Model
import xgboost as xgb

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")
FORECAST_DIR = os.path.join(BASE_DIR, "../backend/files/forecastData")

LOOKBACK = 30
DEFAULT_HORIZON = 90
STATIC_COLS = [
    "Day_of_Week", "Month", "Week_of_Year",
    "Quarter", "Is_Weekend", "Promotion_Flag",
    "Rolling_7d_Sales", "Rolling_30d_Sales",
]

# ==========================================
# DataLoader
# ==========================================
class DataLoader:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self.clean_path = os.path.abspath(os.path.join(CLEAN_DIR, f"user_{self.user_id}"))
        if not os.path.exists(self.clean_path):
            raise FileNotFoundError(f"No cleaned data found for user {user_id} at {self.clean_path}")

    def get_merged_or_latest_file(self):
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

    def load_df(self):
        path = self.get_merged_or_latest_file()
        print(f"[DataLoader] Loading dataset: {path}")
        df = pd.read_excel(path)
        df = df.sort_values("Date").reset_index(drop=True)
        return df, path


def make_future_dates(last_date: pd.Timestamp, horizon_days: int):
    return [last_date + timedelta(days=i) for i in range(1, horizon_days + 1)]


def build_static_features_for_dates(dates: list):
    rows = []
    for d in dates:
        dt = pd.Timestamp(d)
        row = {
            "Date": dt,
            "Day_of_Week": dt.dayofweek + 1,
            "Month": dt.month,
            "Week_of_Year": dt.isocalendar()[1],
            "Quarter": dt.quarter,
            "Is_Weekend": 1 if dt.dayofweek in (5, 6) else 0,
            "Promotion_Flag": 0,
            "Rolling_7d_Sales": 0.0,
            "Rolling_30d_Sales": 0.0,
        }
        rows.append(row)
    return pd.DataFrame(rows)


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)
    return p


# ==========================================
# Model Loading + Feature Extractor
# ==========================================
def load_models(user_id: str):
    user_model_dir = os.path.join(MODEL_DIR, f"user_{user_id}")
    if not os.path.exists(user_model_dir):
        raise FileNotFoundError(f"No models found for user {user_id} in {user_model_dir}")

    lstm_path = os.path.join(user_model_dir, "lstm_model.keras")
    xgb_path = os.path.join(user_model_dir, "xgb_model.json")

    print(f"[Models] Loading LSTM from {lstm_path}")
    lstm_model = load_model(lstm_path)

    print(f"[Models] Loading XGBoost from {xgb_path}")
    xgb_model = xgb.XGBRegressor()
    xgb_model.load_model(xgb_path)

    stats_path = os.path.join(user_model_dir, "norm_stats.json")
    with open(stats_path, "r") as f:
        stats = json.load(f)

    return lstm_model, xgb_model, stats


def create_feature_extractor(lstm_model):
    lstm_layer = lstm_model.layers[0]
    input_shape = lstm_model.input_shape[1:]
    input_layer = Input(shape=input_shape)
    feature_output = lstm_layer(input_layer, training=False)
    extractor = Model(inputs=input_layer, outputs=feature_output)
    return extractor


# ==========================================
# Rolling Values
# ==========================================
def prepare_recent_rolling_values(df, lookback=LOOKBACK):
    target_col = "Total_Sales" if "Total_Sales" in df.columns else ("Units_Sold" if "Units_Sold" in df.columns else None)
    if target_col is None:
        raise ValueError("No target column found.")

    series = df[target_col].astype(float).fillna(0).tolist()

    last_rolling_7 = float(df[target_col].rolling(7, min_periods=1).mean().iloc[-1])
    last_rolling_30 = float(df[target_col].rolling(30, min_periods=1).mean().iloc[-1])

    return series, last_rolling_7, last_rolling_30, target_col


# ==========================================
# Forecast Pipeline
# ==========================================
def forecast_for_user(user_id: str, horizon_days: int = DEFAULT_HORIZON):
    print(f"[Forecast] Starting forecast for user {user_id}, horizon {horizon_days} days")
    
    loader = DataLoader(user_id)
    df, data_path = loader.load_df()

    date_span = (pd.to_datetime(df["Date"]).max() - pd.to_datetime(df["Date"]).min()).days + 1
    is_weekly_upload = df["Date"].nunique() <= 8
    print(f"[Forecast] Detected data span: {date_span} days ({'WEEKLY' if is_weekly_upload else 'MULTI-YEAR'})")

    lstm_model, xgb_model, stats = load_models(user_id)
    extractor = create_feature_extractor(lstm_model)

    series, last_r7, last_r30, target_col = prepare_recent_rolling_values(df, LOOKBACK)
    rolling7 = series[-7:]
    rolling30 = series[-30:]

    last_date = pd.to_datetime(df["Date"].iloc[-1])

    # weekly comparison remains unchanged
    if is_weekly_upload:
        hist_loader = DataLoader(user_id)
        hist_path = hist_loader.get_merged_or_latest_file()
        hist_df = pd.read_excel(hist_path)
        current_week_sum = df[target_col].sum()
        hist_df["YearWeek"] = hist_df["Date"].dt.strftime("%Y-%U")
        historical_mean = hist_df.groupby("YearWeek")[target_col].sum().mean()
        deviation = ((current_week_sum - historical_mean) / historical_mean) * 100
        print(f"[Compare] This week's total sales: {current_week_sum:,.2f}")
        print(f"[Compare] Historical weekly average: {historical_mean:,.2f}")
        print(f"[Compare] Deviation vs 3-year mean: {deviation:+.2f}%")

    horizons = [7, 30, 90]
    forecast_outputs = {}

    for horizon in horizons:
        print(f"\n[Forecast] Generating {horizon}-day forecast...")
        future_dates = make_future_dates(last_date, horizon)
        future_static = build_static_features_for_dates(future_dates)
        future_static["Rolling_7d_Sales"] = np.mean(rolling7[-7:])
        future_static["Rolling_30d_Sales"] = np.mean(rolling30[-30:])

        results = []
        current_series = series.copy()

        sample_input = np.zeros((1, LOOKBACK, 1))
        sample_feat = extractor.predict(sample_input)
        lstm_feat_dim = sample_feat.shape[1]

        for idx, row in future_static.iterrows():
            seq = np.array(current_series[-LOOKBACK:], dtype=float)
            if len(seq) < LOOKBACK:
                seq = np.concatenate([np.zeros(LOOKBACK - len(seq)), seq])
            seq_in = seq.reshape(1, LOOKBACK, 1)

            lstm_next = float(lstm_model.predict(seq_in, verbose=0).reshape(-1)[0])
            lstm_features = extractor.predict(seq_in, verbose=0).reshape(-1)

            # ----------------------------------------------------
            # FIXED: Removed LSTM_Pred from XGB input features, try
            # ----------------------------------------------------
            feat_dict = {
                **{c: row[c] for c in STATIC_COLS},
                **{f"LSTM_Feature_{i+1}": lstm_features[i]
                   for i in range(lstm_feat_dim)}
            }
            # ----------------------------------------------------

            X_row = pd.DataFrame([feat_dict])
            xgb_pred = float(xgb_model.predict(X_row)[0])

            rolling7.append(xgb_pred)
            rolling30.append(xgb_pred)

            results.append({
                "Date": row["Date"],
                "LSTM_Pred": lstm_next,        # kept in OUTPUT
                "Forecast_Sales": xgb_pred     # XGB final output
            })

            current_series.append(xgb_pred)

        forecast_outputs[horizon] = pd.DataFrame(results)

    out_dir = ensure_dir(os.path.join(FORECAST_DIR, f"user_{user_id}"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(out_dir, f"forecast_summary_{ts}.xlsx")

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        for horizon, df_out in forecast_outputs.items():
            df_out.to_excel(writer, sheet_name=f"{horizon}d_forecast", index=False)
        if is_weekly_upload:
            summary_df = pd.DataFrame([{
                "User": user_id,
                "Week_Sales": current_week_sum,
                "Historical_Avg": historical_mean,
                "Deviation_%": deviation
            }])
            summary_df.to_excel(writer, sheet_name="weekly_comparison", index=False)

    print(f"\nForecast completed and saved to: {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate sales forecast for a user.")
    parser.add_argument("user_id")
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON)
    args = parser.parse_args()

    try:
        out = forecast_for_user(args.user_id, horizon_days=args.horizon)
        print(f"Forecast generation completed: {out}")
    except Exception as e:
        print("Forecast generation failed:", str(e))
        raise


if __name__ == "__main__":
    main()
