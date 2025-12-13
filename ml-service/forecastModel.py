# ml-service/forecastModel.py
"""
Product-Level Sales Forecasting Generation Script (updated)

- Loads trained per-product models (LSTM + XGB) saved by trainModel.py
- Produces 7d / 30d / 90d forecasts (same as before)
- Loads training report (if present) and includes training metrics in the output
- Attempts to evaluate forecasts when a recent weekly processed file (actuals) is available:
    -> compares forecasted vs actual 'Units_Sold' for overlapping dates
    -> computes RMSE / MAE / MAPE per product and overall
    -> saves evaluation results to the output Excel
"""

import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import sys
import json
from datetime import datetime, timedelta
import re
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import pandas as pd

from tensorflow.keras.models import load_model
from tensorflow.keras import Input, Model
import xgboost as xgb

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")
FORECAST_DIR = os.path.join(BASE_DIR, "../backend/files/forecastData")
WEEKLY_DIR = os.path.join(BASE_DIR, "../backend/files/weeklyData")
REPORT_DIR = os.path.join(BASE_DIR, "reports")

LOOKBACK = 90
HORIZONS = [7, 30, 90]  # days
STATIC_COLS = [
    "Day_of_Week", "Month", "Week_of_Year",
    "Quarter", "Is_Weekend", "Promotion_Flag",
    "Rolling_7d_Sales", "Rolling_30d_Sales",
]


# -------------------------
# Helpers: directories, dates, metrics
# -------------------------
def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


def normalize_sequence(seq, mean, std):
    return (seq - mean) / std


def make_future_dates(last_date: pd.Timestamp, horizon_days: int):
    return [last_date + timedelta(days=i) for i in range(1, horizon_days + 1)]


def build_static_features_for_dates(dates: list):
    rows = []
    for d in dates:
        dt = pd.Timestamp(d)
        rows.append({
            "Date": dt,
            "Day_of_Week": dt.dayofweek + 1,
            "Month": dt.month,
            "Week_of_Year": dt.isocalendar()[1],
            "Quarter": dt.quarter,
            "Is_Weekend": 1 if dt.dayofweek in (5, 6) else 0,
            "Promotion_Flag": 0,
            "Rolling_7d_Sales": 0.0,
            "Rolling_30d_Sales": 0.0,
        })
    return pd.DataFrame(rows)


def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))


def mae(y_true, y_pred):
    return float(np.mean(np.abs(np.array(y_true) - np.array(y_pred))))


def mape(y_true, y_pred):
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    mask = y_true != 0
    if np.sum(mask) == 0:
        return float(np.nan)
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


# -------------------------
# Data loader (same logic)
# -------------------------
class DataLoader:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self.clean_path = os.path.abspath(os.path.join(CLEAN_DIR, f"user_{self.user_id}"))
        self.weekly_path = os.path.abspath(os.path.join(WEEKLY_DIR, f"user_{self.user_id}"))
        if not os.path.exists(self.clean_path):
            raise FileNotFoundError(f"No cleaned data found for user {user_id}")

    def get_merged_or_latest_file(self):
        files = os.listdir(self.clean_path)
        merged_files = [f for f in files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]

        if merged_files:
            latest_merged = max(
                merged_files,
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
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
        df = df.sort_values(["Product_ID", "Date"]).reset_index(drop=True)
        return df, path
    
    def get_latest_weekly_data(self):
        """
        Load the latest weekly data if it exists
        Returns: (weekly_df, path) or (None, None)
        """
        if not os.path.exists(self.weekly_path):
            return None, None
        
        files = [f for f in os.listdir(self.weekly_path) if "_weekly_" in f and f.endswith(".xlsx")]
        if not files:
            return None, None
        
        latest = max(files, key=lambda f: os.path.getctime(os.path.join(self.weekly_path, f)))
        weekly_file_path = os.path.join(self.weekly_path, latest)
        
        try:
            weekly_df = pd.read_excel(weekly_file_path)
            weekly_df["Date"] = pd.to_datetime(weekly_df["Date"])
            print(f"[DataLoader] Found weekly data: {weekly_file_path}")
            print(f"             Date range: {weekly_df['Date'].min()} to {weekly_df['Date'].max()}")
            return weekly_df, weekly_file_path
        except Exception as e:
            print(f"[DataLoader] Failed to load weekly data: {str(e)}")

        return None, None
    
    def should_merge_weekly_data(training_df: pd.DataFrame, weekly_df: pd.DataFrame) -> bool:
        """
        Decide if we should merge weekly data with training data
        
        Logic:
        - If weekly data is NEWER than training data (gap exists) → MERGE
        - If weekly data OVERLAPS with training data → DON'T MERGE
        """
        training_max = training_df["Date"].max()
        weekly_min = weekly_df["Date"].min()
        weekly_max = weekly_df["Date"].max()
        
        print(f"\n[Merge Decision]")
        print(f"  Training ends: {training_max.strftime('%Y-%m-%d')}")
        print(f"  Weekly starts: {weekly_min.strftime('%Y-%m-%d')}")
        print(f"  Weekly ends:   {weekly_max.strftime('%Y-%m-%d')}")
        
        # Check if there's a gap (weekly starts after training ends)
        gap_days = (weekly_min - training_max).days
        
        if gap_days > 1:
            print(f"   GAP DETECTED: {gap_days} days between training and weekly data")
            print(f"  → Decision: MERGE weekly data to bridge the gap")
            return True
        elif gap_days <= 0:
            print(f"    Weekly data OVERLAPS with training data")
            print(f"  → Decision: USE TRAINING DATA ONLY (no merge needed)")
            return False
        else:
            print(f"    Weekly data is CONTINUOUS with training (1-day gap)")
            print(f"  → Decision: MERGE for continuity")

        return True


    def get_latest_weekly_processed(self):
        """
        Return path to the latest processed file (assumed the weekly upload)
        We'll look for the most recent _processed_ file.
        """
        processed = [f for f in os.listdir(self.clean_path) if "_processed_" in f and f.endswith(".xlsx")]
        if not processed:
            return None
        latest = max(processed, key=lambda f: os.path.getctime(os.path.join(self.clean_path, f)))
        return os.path.join(self.clean_path, latest)

    def find_weekly_files_for_period(self, start_date: pd.Timestamp, end_date: pd.Timestamp):
        """
        Search the user's weekly upload directory for weekly files whose date ranges
        overlap the requested period [start_date, end_date]. Returns list of file
        paths (may be empty).
        """
        if not os.path.exists(self.weekly_path):
            print(f"[DEBUG] Weekly path does not exist: {self.weekly_path}")
            return []

        candidates = [f for f in os.listdir(self.weekly_path) if ("_weekly_" in f or "Sales_Data_Week" in f) and f.endswith(".xlsx")]
        print(f"[DEBUG] Found {len(candidates)} candidate weekly files: {candidates}")
        
        matches = []
        for fname in candidates:
            # Attempt to extract a date from the filename. Support YYYY-MM-DD or YYYYMMDD
            m = re.search(r"(\d{4}-\d{2}-\d{2})", fname)
            if m:
                file_start = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            else:
                m2 = re.search(r"(\d{8})", fname)
                if m2:
                    file_start = datetime.strptime(m2.group(1), "%Y%m%d").date()
                else:
                    print(f"[DEBUG]   {fname}: Could not extract date")
                    continue

            file_end = file_start + timedelta(days=6)
            period_start = start_date.date()
            period_end = end_date.date()
            # Check overlap
            overlaps = not (file_end < period_start or file_start > period_end)
            print(f"[DEBUG]   {fname}: dates {file_start} to {file_end}, period {period_start} to {period_end}, overlaps={overlaps}")
            
            if overlaps:
                matches.append(os.path.join(self.weekly_path, fname))

        print(f"[DEBUG] Matched {len(matches)} weekly files for period {start_date.date()} to {end_date.date()}")
        # Sort by creation time ascending so older files come first
        matches = sorted(matches, key=lambda p: os.path.getctime(p))
        return matches


# -------------------------
# Model loader (unchanged but organized)
# -------------------------
MODEL_CACHE = {}


def load_product_models(user_id: str):
    if user_id in MODEL_CACHE:
        print(f"[Models] Loaded {len(MODEL_CACHE[user_id])} cached models")
        return MODEL_CACHE[user_id]

    user_model_dir = os.path.join(MODEL_DIR, f"user_{user_id}")
    if not os.path.exists(user_model_dir):
        raise FileNotFoundError(f"No models found for user {user_id}")

    product_dirs = [
        d for d in os.listdir(user_model_dir)
        if os.path.isdir(os.path.join(user_model_dir, d)) and d.startswith("product_")
    ]
    if not product_dirs:
        raise FileNotFoundError(f"No product models found for user {user_id}")

    print(f"[Models] Loading {len(product_dirs)} product models...")
    models = {}
    for idx, product_dir in enumerate(product_dirs, 1):
        product_path = os.path.join(user_model_dir, product_dir)
        if idx % 50 == 0 or idx == len(product_dirs):
            progress = (idx / len(product_dirs)) * 100
            print(f"   Loading models: {idx}/{len(product_dirs)} ({progress:.0f}%)")

        stats_path = os.path.join(product_path, "norm_stats.json")
        with open(stats_path, "r") as fh:
            stats = json.load(fh)

        product_id = stats["product_id"]

        # load models
        lstm_path = os.path.join(product_path, "lstm_model.keras")
        lstm_model = load_model(lstm_path, compile=False)

        xgb_path = os.path.join(product_path, "xgb_model.json")
        xgb_model = xgb.XGBRegressor()
        xgb_model.load_model(xgb_path)

        # create extractor
        lstm_layer = lstm_model.layers[0]
        input_shape = lstm_model.input_shape[1:]
        input_layer = Input(shape=input_shape)
        feature_output = lstm_layer(input_layer, training=False)
        extractor = Model(inputs=input_layer, outputs=feature_output)

        lstm_model.make_predict_function()
        extractor.make_predict_function()

        models[product_id] = {
            "lstm_model": lstm_model,
            "xgb_model": xgb_model,
            "extractor": extractor,
            "stats": stats
        }

    MODEL_CACHE[user_id] = models
    print(f"\n[Models]  All {len(models)} models loaded successfully!\n")
    return models


# -------------------------
# Forecaster (keeps batched extractor idea)
# -------------------------
class ProductForecaster:
    def __init__(self, product_id, product_data, models):
        self.product_id = product_id
        self.product_data = product_data.sort_values("Date").reset_index(drop=True)
        self.models = models

        self.stats = models["stats"]
        self.lstm_model = models["lstm_model"]
        self.xgb_model = models["xgb_model"]
        self.extractor = models["extractor"]

        self.lookback = self.stats.get("lookback", LOOKBACK)
        self.product_name = self.stats["product_name"]
        self.category = self.stats["category"]
        self.avg_unit_price = self.stats.get("avg_unit_price", 0.0)

    def prepare_recent_data(self):
        series = self.product_data["Units_Sold"].astype(float).fillna(0).tolist()
        last_date = pd.to_datetime(self.product_data["Date"].iloc[-1])
        return series, last_date

    def forecast_horizon(self, horizon_days: int):
        series, last_date = self.prepare_recent_data()
        rolling7 = series[-7:].copy() if len(series) >= 7 else series.copy()
        rolling30 = series[-30:].copy() if len(series) >= 30 else series.copy()

        future_dates = make_future_dates(last_date, horizon_days)
        future_static = build_static_features_for_dates(future_dates)

        sequences = []
        temp_series = series.copy()
        for _ in future_static.itertuples():
            seq = np.array(temp_series[-self.lookback:], dtype=float)
            if len(seq) < self.lookback:
                seq = np.concatenate([np.zeros(self.lookback - len(seq)), seq])

            seq_norm = normalize_sequence(seq, self.stats["mean"], self.stats["std"])
            sequences.append(seq_norm.reshape(self.lookback, 1))
            temp_series.append(0)

        seq_batch = np.stack(sequences, axis=0)
        lstm_features_batch = self.extractor.predict(seq_batch, verbose=0)

        results = []
        for idx, row in future_static.iterrows():
            lstm_features = lstm_features_batch[idx]
            current_rolling_7 = float(np.mean(rolling7[-7:])) if len(rolling7) >= 7 else float(np.mean(rolling7))
            current_rolling_30 = float(np.mean(rolling30[-30:])) if len(rolling30) >= 30 else float(np.mean(rolling30))

            feat_dict = {
                "Day_of_Week": row["Day_of_Week"],
                "Month": row["Month"],
                "Week_of_Year": row["Week_of_Year"],
                "Quarter": row["Quarter"],
                "Is_Weekend": row["Is_Weekend"],
                "Promotion_Flag": row["Promotion_Flag"],
                "Rolling_7d_Sales": current_rolling_7,
                "Rolling_30d_Sales": current_rolling_30,
                **{f"LSTM_Feature_{i+1}": lstm_features[i] for i in range(len(lstm_features))}
            }

            X_row = pd.DataFrame.from_dict([feat_dict])
            xgb_pred = float(self.xgb_model.predict(X_row)[0])
            xgb_pred = max(0, xgb_pred)

            rolling7.append(xgb_pred)
            rolling30.append(xgb_pred)
            if len(rolling7) > 7:
                rolling7.pop(0)
            if len(rolling30) > 30:
                rolling30.pop(0)

            revenue = xgb_pred * self.avg_unit_price

            results.append({
                "Date": row["Date"],
                "Product_ID": self.product_id,
                "Product_Name": self.product_name,
                "Category": self.category,
                "Forecast_Qty": round(xgb_pred, 2),
                "Revenue_Estimate": round(revenue, 2),
                "Avg_Unit_Price": round(self.avg_unit_price, 2)
            })

        return pd.DataFrame(results)


# -------------------------
# Tools to load training report and evaluate forecasts
# -------------------------
def load_training_report(user_id: str):
    report_path = os.path.join(REPORT_DIR, f"user_{user_id}_training_report.csv")
    if os.path.exists(report_path):
        try:
            df = pd.read_csv(report_path)
            return df
        except Exception:
            return None
    return None


def evaluate_forecasts_against_actuals(forecast_df: pd.DataFrame, actuals_df: pd.DataFrame):
    """
    forecast_df: DataFrame with columns Date, Product_ID, Forecast_Qty
    actuals_df: DataFrame with columns Date, Product_ID, Units_Sold (actual)
    Returns: eval_df per-product + overall summary dict
    """
    # Normalize date types
    forecast_df = forecast_df.copy()
    actuals_df = actuals_df.copy()
    forecast_df["Date"] = pd.to_datetime(forecast_df["Date"])
    actuals_df["Date"] = pd.to_datetime(actuals_df["Date"])

    # merge on Date + Product_ID for overlapping dates
    merged = pd.merge(
        forecast_df[["Date", "Product_ID", "Forecast_Qty"]],
        actuals_df[["Date", "Product_ID", "Units_Sold"]],
        on=["Date", "Product_ID"],
        how="inner"
    )

    if merged.empty:
        return pd.DataFrame(), {"overall": {"RMSE": None, "MAE": None, "MAPE": None}, "n": 0}

    # compute metrics per product
    eval_rows = []
    for pid, group in merged.groupby("Product_ID"):
        y_true = group["Units_Sold"].values
        y_pred = group["Forecast_Qty"].values
        eval_rows.append({
            "Product_ID": pid,
            "Records": len(group),
            "RMSE": rmse(y_true, y_pred),
            "MAE": mae(y_true, y_pred),
            "MAPE": mape(y_true, y_pred)
        })

    eval_df = pd.DataFrame(eval_rows).sort_values("RMSE")
    # overall
    overall = {
        "RMSE": rmse(merged["Units_Sold"].values, merged["Forecast_Qty"].values),
        "MAE": mae(merged["Units_Sold"].values, merged["Forecast_Qty"].values),
        "MAPE": mape(merged["Units_Sold"].values, merged["Forecast_Qty"].values)
    }
    return eval_df, {"overall": overall, "n": len(merged)}


# -------------------------
# Main pipeline
# -------------------------
def calculate_demand_levels(forecast_df):
    """
        Percentile-based demand classification.
        Automatically adapts to dataset scale.
    """
    product_avg = (
        forecast_df.groupby("Product_ID")["Forecast_Qty"]
        .mean()
        .reset_index()
        .rename(columns={"Forecast_Qty": "Avg_Daily_Sales"})
    )

    meta = forecast_df.groupby("Product_ID").agg({
        "Product_Name": "first",
        "Category": "first"
    }).reset_index()

    product_avg = product_avg.merge(meta, on="Product_ID", how="left")

    p40 = np.percentile(product_avg["Avg_Daily_Sales"], 40)
    p80 = np.percentile(product_avg["Avg_Daily_Sales"], 80)

    def classify(avg):
        if avg >= p80:
            return "HIGH DEMAND"
        elif avg >= p40:
            return "MEDIUM DEMAND"
        else:
            return "LOW DEMAND"

    product_avg["Demand_Level"] = product_avg["Avg_Daily_Sales"].apply(classify)

    def recommendation(level):
        if level == "HIGH DEMAND":
            return "Fast-moving product. Monitor stock frequently."
        elif level == "MEDIUM DEMAND":
            return "Moderate demand. Review weekly."
        else:
            return "Slow-moving product. Stock minimal quantities."

    product_avg["Recommendation"] = product_avg["Demand_Level"].apply(recommendation)
    return product_avg.sort_values("Avg_Daily_Sales", ascending=False)


def convert_dates(obj):
    if isinstance(obj, dict):
        return {k: convert_dates(v) for k, v in obj.items()}

    elif isinstance(obj, list):
        return [convert_dates(v) for v in obj]

    elif isinstance(obj, (pd.Timestamp, datetime, np.datetime64)):
        # Convert to pandas timestamp then extract only the date
        return pd.to_datetime(obj).strftime("%Y-%m-%d")

    else:
        return obj

def forecast_for_user(user_id: str):
    print("\n" + "="*70)
    print(f" Starting Product-Level Forecasting for User {user_id}")
    print("="*70 + "\n")

    # Load training data (for historical context)
    loader = DataLoader(user_id)
    df, data_path = loader.load_df()
    models = load_product_models(user_id)

    print(f"[Training Data] Loaded {len(df)} records")
    print(f"[Models] Loaded {len(models)} product models\n")

    # Validate training data dates
    df["Date"] = pd.to_datetime(df["Date"])
    training_date_range = f"{df['Date'].min().strftime('%Y-%m-%d')} to {df['Date'].max().strftime('%Y-%m-%d')}"
    print(f"[Training Data] Date range: {training_date_range}")
    
    #  NEW: Load weekly data (from weekly uploads) to get CORRECT last date
    weekly_df, weekly_path = loader.get_latest_weekly_data()

    if weekly_df is not None:
        print(f" Loading weekly data to determine forecast start date...")
        weekly_df["Date"] = pd.to_datetime(weekly_df["Date"])

        # Validate weekly data dates are after training data
        weekly_min = weekly_df["Date"].min()
        weekly_max = weekly_df["Date"].max()
        training_max = df["Date"].max()

        print(f"[Weekly Data] Date range: {weekly_min.strftime('%Y-%m-%d')} to {weekly_max.strftime('%Y-%m-%d')}")

        # Use the LATEST date from weekly data
        latest_date = weekly_max
        print(f"   Latest data date: {latest_date.strftime('%Y-%m-%d')}")

        # VALIDATION: Check if weekly data is actually newer
        if weekly_min > training_max:
            print(f"   ✓ Weekly data is newer than training data (gap of {(weekly_min - training_max).days} days)")
        elif weekly_min == training_max:
            print(f"   ✓ Weekly data starts exactly where training data ends")
        else:
            print(f"   ⚠ WARNING: Weekly data overlaps or precedes training data (check date parsing!)")
    else:
        print(" No weekly data found, using training data date")
        latest_date = df["Date"].max()

    print(f" Forecast will start from: {(latest_date + timedelta(days=1)).strftime('%Y-%m-%d')}\n")

    # Generate forecasts for each product
    all_forecasts = {h: [] for h in HORIZONS}

    for idx, (product_id, product_models) in enumerate(models.items(), 1):
        #  IMPORTANT: Use weekly data if available for that product
        if weekly_df is not None and len(weekly_df) > 0:
            try:
                weekly_product_df = weekly_df[weekly_df["Product_ID"] == product_id].copy()
                if len(weekly_product_df) > 0:
                    # Append weekly data to training data for forecasting
                    product_data = df[df["Product_ID"] == product_id].copy()
                    
                    #  Combine: training data + recent weekly data
                    combined = pd.concat([product_data, weekly_product_df], ignore_index=True)
                    combined = combined.drop_duplicates(subset=["Date"], keep="last")
                    combined = combined.sort_values("Date").reset_index(drop=True)
                    
                    product_data = combined
                    print(f"[{idx}/{len(models)}] {product_models['stats']['product_name']} - Using {len(weekly_product_df)} weekly records")
                else:
                    product_data = df[df["Product_ID"] == product_id]
            except Exception as e:
                print(f" Failed to merge weekly data for {product_id}: {str(e)}")
                product_data = df[df["Product_ID"] == product_id]
        else:
            product_data = df[df["Product_ID"] == product_id]

        product_name = product_models["stats"]["product_name"]

        try:
            forecaster = ProductForecaster(product_id, product_data, product_models)

            for horizon in HORIZONS:
                forecast_df = forecaster.forecast_horizon(horizon)
                all_forecasts[horizon].append(forecast_df)
                print(f"    {horizon}-day forecast generated ({len(forecast_df)} days)")

            print()

        except Exception as e:
            print(f"    Failed: {str(e)}\n")
            continue

    # Combine forecasts per horizon
    combined_forecasts = {}
    for horizon in HORIZONS:
        if all_forecasts[horizon]:
            combined_forecasts[f"{horizon}d_forecast"] = pd.concat(all_forecasts[horizon], ignore_index=True)
            print(f" {horizon}-day forecast: {len(combined_forecasts[f'{horizon}d_forecast'])} records")

    # Training metrics (if any)
    training_metrics_df = load_training_report(user_id)
    if training_metrics_df is not None:
        print(f"[Training Report] Loaded training report with {len(training_metrics_df)} rows")
    else:
        print("[Training Report] No training report found")

    # For evaluation we'll search weekly upload files that overlap each forecast horizon
    # Use DataLoader.find_weekly_files_for_period to find any weekly files whose
    # date ranges overlap the forecast window for each horizon (7/30/90).
    # We'll load and concat any matching weekly files per-horizon and run evaluation
    # only when overlapping actuals exist.
    print("[Evaluation] Locating weekly files that overlap each forecast horizon...")

    # Build output path (week-based)
    # Use the `latest_date` determined earlier (weekly if present, else training)
    forecast_start_date = latest_date + timedelta(days=1)
    forecast_end_date_7d = forecast_start_date + timedelta(days=6)
    forecast_end_date_90d = forecast_start_date + timedelta(days=89)

    week_start_str = forecast_start_date.strftime("%Y%m%d")
    week_end_str = forecast_end_date_7d.strftime("%Y%m%d")
    out_dir = ensure_dir(os.path.join(FORECAST_DIR, f"user_{user_id}"))
    # Filename clearly indicates the forecast date range and generation date
    filename = f"forecast_week_{week_start_str}_to_{week_end_str}_generated_{datetime.now().strftime('%Y%m%d')}.xlsx"
    out_path = os.path.join(out_dir, filename)

    # remove existing file to replace with new forecast
    if os.path.exists(out_path):
        print(f"  Existing forecast file found for week {week_start_str} to {week_end_str}. Updating...")

    print(f"\n Saving forecast to: {out_path}")
    print(f" Forecast period: {forecast_start_date.strftime('%Y-%m-%d')} to {forecast_end_date_90d.strftime('%Y-%m-%d')}\n")


    # Prepare evaluation accumulator
    evaluation_summary_list = []
    evaluation_detail_frames = {}

    # Write to Excel: forecasts + demand_alerts + training_metrics + evaluation (if any)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        for sheet_name, forecast_df in combined_forecasts.items():
            forecast_df.to_excel(writer, sheet_name=sheet_name, index=False)

        # Demand alerts from 90d forecast
        if "90d_forecast" in combined_forecasts:
            demand_alerts = calculate_demand_levels(combined_forecasts["90d_forecast"])
            if not demand_alerts.empty:
                demand_alerts.to_excel(writer, sheet_name="demand_alerts", index=False)

        # Training metrics sheet (if available)
        if training_metrics_df is not None:
            training_metrics_df.to_excel(writer, sheet_name="training_metrics", index=False)

        # Evaluation: for each horizon, find weekly files overlapping the horizon
        # results are collected into `evaluation_detail_frames` and `evaluation_summary_list`
        overall_summary = []
        for horizon in HORIZONS:
            sheet_key = f"{horizon}d_forecast"
            if sheet_key not in combined_forecasts:
                continue

            fdf = combined_forecasts[sheet_key].copy()
            fdf["Date"] = pd.to_datetime(fdf["Date"])

            # Use actual forecast DataFrame date range (not computed from latest_date)
            horizon_start = fdf["Date"].min()
            horizon_end = fdf["Date"].max()
            print(f"[DEBUG] Evaluating {horizon}-day forecast: dates {horizon_start.date()} to {horizon_end.date()}")

            matches = loader.find_weekly_files_for_period(horizon_start, horizon_end)
            if not matches:
                print(f"[Evaluation] No weekly files overlapping {horizon}-day forecast window.")
                continue

            # Load and concat matching weekly files
            dfs = []
            for p in matches:
                try:
                    w = pd.read_excel(p)
                    w["Date"] = pd.to_datetime(w["Date"])
                    if {"Date", "Product_ID", "Units_Sold"}.issubset(set(w.columns)):
                        dfs.append(w[["Date", "Product_ID", "Units_Sold"]])
                    else:
                        print(f"[Evaluation] Weekly file missing required columns: {p}")
                except Exception as e:
                    print(f"[Evaluation] Failed loading weekly file {p}: {e}")

            if not dfs:
                continue

            actuals_h = pd.concat(dfs, ignore_index=True)

            eval_df, overall = evaluate_forecasts_against_actuals(fdf, actuals_h)
            if not eval_df.empty:
                evaluation_detail_frames[f"{horizon}d_eval"] = eval_df
                overall_summary.append({
                    "horizon_days": horizon,
                    "RMSE": overall["overall"]["RMSE"],
                    "MAE": overall["overall"]["MAE"],
                    "MAPE": overall["overall"]["MAPE"],
                    "records": overall["n"]
                })
                evaluation_summary_list.append({
                    "horizon": horizon,
                    "overall": overall["overall"],
                    "records": overall["n"]
                })

        # save per-product evaluation frames (one sheet per horizon)
        for sheet, frame in evaluation_detail_frames.items():
            frame.to_excel(writer, sheet_name=sheet, index=False)

        # Save overall summary (or write a note if none)
        if overall_summary:
            pd.DataFrame(overall_summary).to_excel(writer, sheet_name="forecast_evaluation_summary", index=False)
        else:
            pd.DataFrame([{"note": "No overlapping forecast vs actuals found for evaluation."}]).to_excel(writer, sheet_name="forecast_evaluation", index=False)

        # --- Also evaluate the immediately previous forecast (if any) against available weekly actuals ---
        try:
            json_candidates = [f for f in os.listdir(out_dir) if f.startswith('forecast_') and f.endswith('.json')]
            json_candidates = sorted(json_candidates, key=lambda f: os.path.getctime(os.path.join(out_dir, f)))
            if len(json_candidates) >= 2:
                prev_json_path = os.path.join(out_dir, json_candidates[-2])
                print(f"[Evaluation] Found previous forecast JSON for evaluation: {prev_json_path}")
                try:
                    with open(prev_json_path, 'r') as fh:
                        prev_res = json.load(fh)

                    prev_eval_overall = []
                    prev_detail_frames = {}
                    prev_fp_start = prev_res.get('forecast_period', {}).get('start')
                    if prev_fp_start:
                        for horizon in HORIZONS:
                            prev_forecasts = prev_res.get('forecasts', {}).get(str(horizon), [])
                            if not prev_forecasts:
                                continue
                            pf_df = pd.DataFrame(prev_forecasts)
                            if pf_df.empty:
                                continue
                            pf_df['Date'] = pd.to_datetime(pf_df['Date'])

                            # Use actual previous forecast dates (not computed)
                            prev_start_date = pf_df['Date'].min()
                            prev_end_date = pf_df['Date'].max()
                            print(f"[DEBUG] Evaluating previous {horizon}-day forecast: dates {prev_start_date.date()} to {prev_end_date.date()}")

                            matches = loader.find_weekly_files_for_period(prev_start_date, prev_end_date)
                            if not matches:
                                print(f"[Evaluation] No weekly files overlap previous forecast {prev_start_date} (horizon {horizon})")
                                continue

                            dfs = []
                            for p in matches:
                                try:
                                    w = pd.read_excel(p)
                                    w['Date'] = pd.to_datetime(w['Date'])
                                    if {"Date", "Product_ID", "Units_Sold"}.issubset(set(w.columns)):
                                        dfs.append(w[["Date", "Product_ID", "Units_Sold"]])
                                except Exception as e:
                                    print(f"[Evaluation] Failed loading weekly file {p} for prev eval: {e}")

                            if not dfs:
                                continue

                            actuals_prev = pd.concat(dfs, ignore_index=True)
                            eval_df_prev, overall_prev = evaluate_forecasts_against_actuals(pf_df, actuals_prev)
                            if not eval_df_prev.empty:
                                sheet = f"prev_{horizon}d_eval"
                                prev_detail_frames[sheet] = eval_df_prev
                                prev_eval_overall.append({
                                    "horizon_days": horizon,
                                    "RMSE": overall_prev["overall"]["RMSE"],
                                    "MAE": overall_prev["overall"]["MAE"],
                                    "MAPE": overall_prev["overall"]["MAPE"],
                                    "records": overall_prev["n"]
                                })

                        # write prev eval sheets and summary if any
                        for sheet, df in prev_detail_frames.items():
                            df.to_excel(writer, sheet_name=sheet, index=False)
                        if prev_eval_overall:
                            pd.DataFrame(prev_eval_overall).to_excel(writer, sheet_name="prev_forecast_evaluation_summary", index=False)
                            # merge into main accumulators so JSON can include it
                            evaluation_summary_list.extend([{"horizon": e["horizon_days"], "overall": {"RMSE": e["RMSE"], "MAE": e["MAE"], "MAPE": e["MAPE"]}, "records": e["records"]} for e in prev_eval_overall])
                            for sheet, df in prev_detail_frames.items():
                                evaluation_detail_frames[sheet] = df

                except Exception as e:
                    print(f"[Evaluation] Failed to read previous forecast JSON: {e}")
        except Exception:
            pass

    print("\n" + "=" * 70)
    print(" Forecasting Completed Successfully!")
    print(f" Output file: {out_path}")
    sheet_list = list(combined_forecasts.keys()) + (["demand_alerts"] if "90d_forecast" in combined_forecasts else [])
    print(f" Forecast sheets: {sheet_list}")
    if training_metrics_df is not None:
        print(" Training metrics included in sheet: training_metrics")
    if evaluation_summary_list:
        print(" Evaluation sheets added (per-horizon) and summary: forecast_evaluation_summary")
    else:
        print(" No evaluation performed (no weekly actuals found).")

    result = {
    "status": "success",
    "user_id": str(user_id),
    "forecast_file": out_path,
    "generated_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "forecast_period": {
        "start": forecast_start_date.strftime("%Y-%m-%d"),
        "end_7d": forecast_end_date_7d.strftime("%Y-%m-%d"),
        "end_90d": forecast_end_date_90d.strftime("%Y-%m-%d")
    },
    "forecasts": {},
    "evaluation": {},
    "demand_levels": []
    }

    # --- 1. Add forecast slices ---
    for horizon in HORIZONS:
        key = f"{horizon}d_forecast"
        if key in combined_forecasts:
            result["forecasts"][str(horizon)] = (
                combined_forecasts[key]
                .to_dict(orient="records")
            )

    # --- 2. Add demand classification ---
    if "90d_forecast" in combined_forecasts:
        demand = calculate_demand_levels(combined_forecasts["90d_forecast"])
        result["demand_levels"] = demand.to_dict(orient="records")

    # --- 3. Add evaluation summary ---
    if evaluation_summary_list:
        eval_summary = {}
        for entry in evaluation_summary_list:
            h = entry["horizon"]
            key = str(h)
            eval_summary[key] = {
                "overall": entry["overall"],
                "records": entry["records"],
                "per_product": []
            }
            sheet_name = f"{h}d_eval"
            if sheet_name in evaluation_detail_frames:
                eval_summary[key]["per_product"] = evaluation_detail_frames[sheet_name].to_dict(orient="records")

        result["evaluation"] = eval_summary
    else:
        result["evaluation"] = {"note": "No weekly actuals found"}

    # ----------------------------------------------------------
    # Persist evaluation metrics CSV (historical logs) and write JSON
    # ----------------------------------------------------------
    # Ensure reports dir
    ensure_dir(REPORT_DIR)
    reports_dir = os.path.join(REPORT_DIR, "evaluation")
    ensure_dir(reports_dir)

    rows = []
    # Helper to extract prev forecast start if needed
    def _get_prev_forecast_start():
        try:
            json_candidates = [f for f in os.listdir(out_dir) if f.startswith('forecast_') and f.endswith('.json')]
            json_candidates = sorted(json_candidates, key=lambda f: os.path.getctime(os.path.join(out_dir, f)))
            if len(json_candidates) >= 2:
                prev_json_path = os.path.join(out_dir, json_candidates[-2])
                with open(prev_json_path, 'r') as fh:
                    prev_res = json.load(fh)
                    return prev_res.get('forecast_period', {}).get('start')
        except Exception:
            return None
        return None

    prev_forecast_start = _get_prev_forecast_start()

    for sheet, frame in evaluation_detail_frames.items():
        if frame is None or frame.empty:
            continue
        # sheet names: '7d_eval' or 'prev_7d_eval'
        m = re.search(r'prev_(\d+)d_eval', sheet)
        source = 'prev' if m else 'current'
        if m:
            horizon = int(m.group(1))
            forecast_start_str = prev_forecast_start or ''
        else:
            m2 = re.search(r'(\d+)d_eval', sheet)
            horizon = int(m2.group(1)) if m2 else None
            forecast_start_str = forecast_start_date.strftime('%Y-%m-%d') if 'forecast_start_date' in locals() else ''

        for _, r in frame.iterrows():
            rows.append({
                'generated_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'user_id': user_id,
                'horizon': horizon,
                'forecast_start': forecast_start_str,
                'Product_ID': r.get('Product_ID'),
                'Records': int(r.get('Records', 0)),
                'RMSE': float(r.get('RMSE')) if r.get('RMSE') is not None else None,
                'MAE': float(r.get('MAE')) if r.get('MAE') is not None else None,
                'MAPE': float(r.get('MAPE')) if r.get('MAPE') is not None else None,
                'source': source
            })

    if rows:
        csv_name = f"evaluation_user_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        csv_path = os.path.join(reports_dir, csv_name)
        try:
            pd.DataFrame(rows).to_csv(csv_path, index=False)
            print(f"[Evaluation] Persisted evaluation CSV: {csv_path}")
        except Exception as e:
            print(f"[Evaluation] Failed to write evaluation CSV: {e}")

    # Convert all timestamps to strings
    result_clean = convert_dates(result)

    json_out = os.path.join(out_dir, f"forecast_{week_start_str}_to_{week_end_str}.json")
    with open(json_out, "w") as f:
        json.dump(result_clean, f, indent=4)

    return result


# -------------------------
# Main entrypoint
# -------------------------
def main():
    if len(sys.argv) < 2:
        print("\nError: User ID required")
        print("Usage: python forecastModel.py <user_id>")
        print("Example: python forecastModel.py 3\n")
        sys.exit(1)

    user_id = sys.argv[1]
    try:
        forecast_for_user(user_id)
    except Exception as e:
        print(f"\nForecasting failed: {str(e)}\n")
        raise


if __name__ == "__main__":
    main()
