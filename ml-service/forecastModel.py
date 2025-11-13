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

# -----------------------
# Configuration
# -----------------------
LOOKBACK = 30  # must match training
DEFAULT_HORIZON = 90  # days (we will also provide weekly/monthly/3-month aggregates)
STATIC_COLS = [
    "Day_of_Week", "Month", "Week_of_Year",
    "Quarter", "Is_Weekend", "Promotion_Flag",
    "Rolling_7d_Sales", "Rolling_30d_Sales",
]


# -----------------------
# Helpers
# -----------------------
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
            # Promotion flag default 0 (unless you have a calendar of holidays/promotions)
            "Promotion_Flag": 0,
            # rolling features will be filled in from recent history (fallback to 0)
            "Rolling_7d_Sales": 0.0,
            "Rolling_30d_Sales": 0.0,
        }
        rows.append(row)
    return pd.DataFrame(rows)


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)
    return p


# -----------------------
# Forecast pipeline
# -----------------------
def load_models(user_id: str):
    user_model_dir = os.path.join(MODEL_DIR, f"user_{user_id}")
    if not os.path.exists(user_model_dir):
        raise FileNotFoundError(f"No models found for user {user_id} in {user_model_dir}")

    lstm_path = os.path.join(user_model_dir, "lstm_model.keras")
    xgb_path = os.path.join(user_model_dir, "xgb_model.json")

    if not os.path.exists(lstm_path):
        raise FileNotFoundError(f"LSTM model not found at {lstm_path}")
    if not os.path.exists(xgb_path):
        raise FileNotFoundError(f"XGBoost model not found at {xgb_path}")

    print(f"[Models] Loading LSTM from {lstm_path}")
    lstm_model = load_model(lstm_path)

    print(f"[Models] Loading XGBoost from {xgb_path}")
    xgb_model = xgb.XGBRegressor()
    xgb_model.load_model(xgb_path)

    return lstm_model, xgb_model


def create_feature_extractor(lstm_model):
    """
    Create a model that maps LSTM input -> LSTM layer output (temporal features).
    We rebuild a model with a fresh Input so we can supply variable sequence windows.
    """
    lstm_layer = lstm_model.layers[0]
    input_shape = lstm_model.input_shape[1:]  # (timesteps, features)
    input_layer = Input(shape=input_shape)
    feature_output = lstm_layer(input_layer)
    extractor = Model(inputs=input_layer, outputs=feature_output)
    return extractor


def prepare_recent_rolling_values(df, lookback=LOOKBACK):
    """
    Compute last rolling statistics used for initializing future rows.
    Returns:
      - last_sales_series (np.array)
      - last_rolling_7 (float)
      - last_rolling_30 (float)
    """
    # Use 'Total_Sales' preferred, fall back to 'Units_Sold' if present and user trained on that
    target_col = "Total_Sales" if "Total_Sales" in df.columns else ("Units_Sold" if "Units_Sold" in df.columns else None)
    if target_col is None:
        raise ValueError("No target column found (Total_Sales or Units_Sold required).")

    series = df[target_col].astype(float).fillna(0).tolist()
    # compute last rolling means
    last_rolling_7 = float(df[target_col].rolling(7, min_periods=1).mean().iloc[-1])
    last_rolling_30 = float(df[target_col].rolling(30, min_periods=1).mean().iloc[-1])

    return series, last_rolling_7, last_rolling_30, target_col


def forecast_for_user(user_id: str, horizon_days: int = DEFAULT_HORIZON):
    print(f"[Forecast] Starting forecast for user {user_id}, horizon {horizon_days} days")
    loader = DataLoader(user_id)
    df, data_path = loader.load_df()

    # Prepare series + recent rolling metrics
    series, last_r7, last_r30, target_col = prepare_recent_rolling_values(df, LOOKBACK)
    last_date = pd.to_datetime(df["Date"].iloc[-1])

    lstm_model, xgb_model = load_models(user_id)
    extractor = create_feature_extractor(lstm_model)

    # create future date frame
    future_dates = make_future_dates(last_date, horizon_days)
    future_static = build_static_features_for_dates(future_dates)

    # initialize rolling values for futures with last known ones
    future_static["Rolling_7d_Sales"] = last_r7
    future_static["Rolling_30d_Sales"] = last_r30

    # Build containers
    results = []

    # model expects X features in same order as training
    # discover LSTM hidden size dynamically
    sample_input = np.zeros((1, LOOKBACK, 1))
    try:
        sample_feat = extractor.predict(sample_input)
        lstm_feat_dim = sample_feat.shape[1]
    except Exception:
        # fallback
        lstm_feat_dim = lstm_model.layers[0].units if hasattr(lstm_model.layers[0], "units") else 16

    lstm_feature_names = [f"LSTM_Feature_{i+1}" for i in range(lstm_feat_dim)]

    # iterate days, recursively predict
    print(f"[Forecast] Iterative forecast loop start (lookback={LOOKBACK}, lstm_feat_dim={lstm_feat_dim})")
    current_series = series.copy()  # grows as we append predictions

    for idx, row in future_static.iterrows():
        # Build LSTM sequence input (last LOOKBACK values)
        seq = np.array(current_series[-LOOKBACK:], dtype=float)
        if len(seq) < LOOKBACK:
            # pad with zeros at front if not enough
            pad = np.zeros(LOOKBACK - len(seq))
            seq = np.concatenate([pad, seq])
        seq_in = seq.reshape(1, LOOKBACK, 1)

        # LSTM: next-step prediction (scalar) and temporal-features extraction
        try:
            lstm_next = float(lstm_model.predict(seq_in, verbose=0).reshape(-1)[0])
        except Exception as e:
            print("[Warning] LSTM next-step predict failed:", e)
            lstm_next = float(np.mean(seq))  # fallback naive

        try:
            lstm_features = extractor.predict(seq_in, verbose=0).reshape(-1)
        except Exception as e:
            print("[Warning] LSTM feature extraction failed:", e)
            lstm_features = np.zeros(lstm_feat_dim)

        # create feature row for xgboost
        static_values = {
            "Day_of_Week": int(row["Day_of_Week"]),
            "Month": int(row["Month"]),
            "Week_of_Year": int(row["Week_of_Year"]),
            "Quarter": int(row["Quarter"]),
            "Is_Weekend": int(row["Is_Weekend"]),
            "Promotion_Flag": int(row["Promotion_Flag"]),
            "Rolling_7d_Sales": float(row["Rolling_7d_Sales"]),
            "Rolling_30d_Sales": float(row["Rolling_30d_Sales"]),
        }

        feat_dict = static_values.copy()
        # add LSTM features
        for i, name in enumerate(lstm_feature_names):
            feat_dict[name] = float(lstm_features[i]) if i < len(lstm_features) else 0.0

        # Optionally also include raw LSTM predicted scalar as a feature
        feat_dict["LSTM_Pred"] = lstm_next

        # Build DataFrame row in correct order
        # Keep same order as training: STATIC_COLS + LSTM features (+ LSTM_Pred)
        x_cols = STATIC_COLS + lstm_feature_names + ["LSTM_Pred"]
        X_row = pd.DataFrame([{c: feat_dict.get(c, 0.0) for c in x_cols}])

        # predict with xgboost
        try:
            xgb_pred = float(xgb_model.predict(X_row)[0])
        except Exception as e:
            print("[Warning] XGBoost predict failed:", e)
            xgb_pred = float(lstm_next)  # fallback

        # append final forecast to current_series so next step can use it
        current_series.append(xgb_pred)

        # record results
        results.append({
            "Date": row["Date"],
            "LSTM_Pred": lstm_next,
            "Forecast_Sales": xgb_pred,
            **static_values
        })

        # update rolling numbers for subsequent days (simple update: rolling means approximate)
        # sliding update: naive incremental update: average of last 7/30 in current_series
        arr = np.array(current_series, dtype=float)
        if len(arr) >= 7:
            last_r7 = float(arr[-7:].mean())
        else:
            last_r7 = float(arr.mean())
        if len(arr) >= 30:
            last_r30 = float(arr[-30:].mean())
        else:
            last_r30 = float(arr.mean())
        # update future_static for remaining rows
        if idx + 1 < len(future_static):
            future_static.iloc[idx + 1, future_static.columns.get_loc("Rolling_7d_Sales")] = last_r7
            future_static.iloc[idx + 1, future_static.columns.get_loc("Rolling_30d_Sales")] = last_r30

    # results -> DataFrame
    daily = pd.DataFrame(results)
    # Fill missing columns if any
    daily = daily[["Date", "Forecast_Sales", "LSTM_Pred", "Day_of_Week", "Month", "Week_of_Year", "Quarter", "Is_Weekend", "Promotion_Flag", "Rolling_7d_Sales", "Rolling_30d_Sales"]]

    # Aggregations
    daily["Date"] = pd.to_datetime(daily["Date"])
    daily["Week_Start"] = daily["Date"].dt.to_period("W").apply(lambda r: r.start_time.date())
    daily["Month_Str"] = daily["Date"].dt.to_period("M").astype(str)

    weekly = daily.groupby("Week_Start", as_index=False).agg({"Forecast_Sales": "sum"})
    monthly = daily.groupby("Month_Str", as_index=False).agg({"Forecast_Sales": "sum"})
    three_month_sum = pd.DataFrame([{
        "Start_Date": daily["Date"].min().date(),
        "End_Date": daily["Date"].max().date(),
        "Forecast_Sales_3months": daily["Forecast_Sales"].sum()
    }])

    # Save output
    out_dir = ensure_dir(os.path.join(FORECAST_DIR, f"user_{user_id}"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(out_dir, f"sales_forecast_{ts}.xlsx")

    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        daily.to_excel(writer, sheet_name="daily_forecast", index=False)
        weekly.to_excel(writer, sheet_name="weekly_summary", index=False)
        monthly.to_excel(writer, sheet_name="monthly_summary", index=False)
        three_month_sum.to_excel(writer, sheet_name="3month_summary", index=False)

    print(f"[Forecast] Saved forecast to: {out_path}")
    return out_path


# -----------------------
# CLI
# -----------------------
def main():
    parser = argparse.ArgumentParser(description="Generate sales forecast for a user.")
    parser.add_argument("user_id", help="User ID (folder user_<id> in cleanData/models)", type=str)
    parser.add_argument("--horizon", help="Forecast horizon in days (default 90)", type=int, default=DEFAULT_HORIZON)
    args = parser.parse_args()

    try:
        out = forecast_for_user(args.user_id, horizon_days=args.horizon)
        print(f"Forecast generation completed: {out}")
    except Exception as e:
        print("Forecast generation failed:", str(e))
        raise


if __name__ == "__main__":
    main()
