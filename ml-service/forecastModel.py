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



def forecast_for_user(user_id: str):
    print("\n" + "="*70)
    print(f" Starting Product-Level Forecasting for User {user_id}")
    print("="*70 + "\n")

    # Load data and models
    loader = DataLoader(user_id)
    df, data_path = loader.load_df()
    models = load_product_models(user_id)

    print(f"[Data] Loaded {len(df)} records")
    print(f"[Models] Loaded {len(models)} product models\n")

    all_forecasts = {h: [] for h in HORIZONS}

    for idx, (product_id, product_models) in enumerate(models.items(), 1):
        product_data = df[df["Product_ID"] == product_id]
        product_name = product_models["stats"]["product_name"]

        print(f"[{idx}/{len(models)}] Forecasting: {product_name} (ID: {product_id})")

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

    # Try to load the latest weekly processed file for evaluation
    weekly_path = loader.get_latest_weekly_processed()
    actuals_df = None
    if weekly_path:
        try:
            actuals_df = pd.read_excel(weekly_path)
            # ensure it has expected columns (Date, Product_ID, Units_Sold)
            if "Units_Sold" not in actuals_df.columns or "Date" not in actuals_df.columns or "Product_ID" not in actuals_df.columns:
                print(f"[Evaluation] Weekly processed file found but required columns missing: {weekly_path}")
                actuals_df = None
            else:
                print(f"[Evaluation] Found weekly processed file for evaluation: {weekly_path}")
        except Exception as e:
            print(f"[Evaluation] Failed to read weekly processed file: {str(e)}")
            actuals_df = None
    else:
        print("[Evaluation] No weekly processed (_processed_) file found for user skipping forecast evaluation.")

    # Build output path (week-based)
    latest_date = df["Date"].max()
    forecast_start_date = latest_date + timedelta(days=1)
    forecast_end_date_7d = forecast_start_date + timedelta(days=6)
    forecast_end_date_90d = forecast_start_date + timedelta(days=89)

    week_start_str = forecast_start_date.strftime("%Y%m%d")
    week_end_str = forecast_end_date_7d.strftime("%Y%m%d")
    out_dir = ensure_dir(os.path.join(FORECAST_DIR, f"user_{user_id}"))
    filename = f"forecast_week_{week_start_str}_to_{week_end_str}.xlsx"
    out_path = os.path.join(out_dir, filename)

    # remove existing file to replace with new forecast
    if os.path.exists(out_path):
        print(f"  Existing forecast file found for week {week_start_str} to {week_end_str}. Updating...")
        os.remove(out_path)

    print(f"\n Saving forecast to: {out_path}")
    print(f" Forecast period: {forecast_start_date.strftime('%Y-%m-%d')} to {forecast_end_date_90d.strftime('%Y-%m-%d')}\n")


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

        # Evaluation: compare forecast -> actuals
        if actuals_df is not None:
            # Evaluate each horizon if overlapping dates exist
            eval_results_frames = {}
            overall_summary = []
            for horizon in HORIZONS:
                sheet_key = f"{horizon}d_forecast"
                if sheet_key not in combined_forecasts:
                    continue
                fdf = combined_forecasts[sheet_key].copy()
                # merge on Date/Product_ID and use Units_Sold from actuals
                eval_df, overall = evaluate_forecasts_against_actuals(fdf, actuals_df)
                if not eval_df.empty:
                    eval_results_frames[f"{horizon}d_eval"] = eval_df
                    overall_summary.append({
                        "horizon_days": horizon,
                        "RMSE": overall["overall"]["RMSE"],
                        "MAE": overall["overall"]["MAE"],
                        "MAPE": overall["overall"]["MAPE"],
                        "records": overall["n"]
                    })

            # save per-product evaluation frames (one sheet per horizon)
            for sheet, frame in eval_results_frames.items():
                frame.to_excel(writer, sheet_name=sheet, index=False)

            # Save overall summary
            if overall_summary:
                pd.DataFrame(overall_summary).to_excel(writer, sheet_name="forecast_evaluation_summary", index=False)
            else:
                # If no overlapping records found, write a small note sheet
                pd.DataFrame([{"note": "No overlapping forecast vs actuals found for evaluation."}]).to_excel(writer, sheet_name="forecast_evaluation", index=False)
        else:
            # no actuals - write a placeholder
            pd.DataFrame([{"note": "No weekly actuals available for evaluation."}]).to_excel(writer, sheet_name="forecast_evaluation", index=False)

    print("\n" + "=" * 70)
    print(" Forecasting Completed Successfully!")
    print(f" Output file: {out_path}")
    sheet_list = list(combined_forecasts.keys()) + (["demand_alerts"] if "90d_forecast" in combined_forecasts else [])
    print(f" Forecast sheets: {sheet_list}")
    if training_metrics_df is not None:
        print(" Training metrics included in sheet: training_metrics")
    if actuals_df is not None:
        print(" Evaluation sheets added (per-horizon) and summary: forecast_evaluation_summary")
    else:
        print(" No evaluation performed (no weekly actuals found).")

    return out_path


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
