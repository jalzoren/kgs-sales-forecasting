# ml-service/evaluationService.py
"""
Separate evaluation service - decoupled from forecast generation.
Evaluates existing forecasts against actual weekly data when it becomes available.
Saves evaluation results as separate JSON files with evaluation_date.
"""

import os
import json
import sys
import io
from datetime import datetime, timedelta
import re
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import numpy as np

# -------- Metrics ---------
def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))

def mae(y_true, y_pred):
    return float(np.mean(np.abs(np.array(y_true) - np.array(y_pred))))

def mape(y_true, y_pred):
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    # Avoid division by zero
    mask = y_true != 0
    if not mask.any():
        return None
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def evaluate_forecasts_against_actuals(forecast_df: pd.DataFrame, actuals_df: pd.DataFrame):
    """
    Evaluate forecast against actuals
    
    forecast_df: DataFrame with columns Date, Product_ID, Forecast_Qty
    actuals_df: DataFrame with columns Date, Product_ID, Units_Sold
    
    Returns: eval_df (per-product metrics) + overall summary dict
    """
    forecast_df = forecast_df.copy()
    actuals_df = actuals_df.copy()
    # Normalize dates to datetime (date-only) and ensure consistent Product_ID typing
    forecast_df["Date"] = pd.to_datetime(forecast_df["Date"]).dt.floor("D")
    actuals_df["Date"] = pd.to_datetime(actuals_df["Date"]).dt.floor("D")

    # Coerce Product_ID to string on both frames to avoid merge mismatches
    if "Product_ID" in forecast_df.columns:
        forecast_df["Product_ID"] = forecast_df["Product_ID"].astype(str).str.strip()
    if "Product_ID" in actuals_df.columns:
        actuals_df["Product_ID"] = actuals_df["Product_ID"].astype(str).str.strip()

    # Debug: show size and sample ids
    try:
        f_pids = set(forecast_df["Product_ID"].unique()) if "Product_ID" in forecast_df.columns else set()
        a_pids = set(actuals_df["Product_ID"].unique()) if "Product_ID" in actuals_df.columns else set()
        common_pids = f_pids.intersection(a_pids)
        print(f"[Evaluation] Forecast rows: {len(forecast_df)}, Actual rows: {len(actuals_df)}")
        print(f"[Evaluation] Unique forecast PIDs: {len(f_pids)}, actual PIDs: {len(a_pids)}, common: {len(common_pids)}")
    except Exception:
        pass

    # Merge on Date + Product_ID for overlapping dates
    merged = pd.merge(
        forecast_df[["Date", "Product_ID", "Forecast_Qty"]],
        actuals_df[["Date", "Product_ID", "Units_Sold"]],
        on=["Date", "Product_ID"],
        how="inner"
    )

    if merged.empty:
        return pd.DataFrame(), {"overall": {"RMSE": None, "MAE": None, "MAPE": None}, "n": 0}

    # Compute metrics per product
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
    
    # Overall metrics
    overall = {
        "RMSE": rmse(merged["Units_Sold"].values, merged["Forecast_Qty"].values),
        "MAE": mae(merged["Units_Sold"].values, merged["Forecast_Qty"].values),
        "MAPE": mape(merged["Units_Sold"].values, merged["Forecast_Qty"].values)
    }
    
    return eval_df, {"overall": overall, "n": len(merged)}


class WeeklyFileFinder:
    """Helper to find weekly files overlapping a date range"""
    
    def __init__(self, weekly_path: str):
        self.weekly_path = weekly_path
    
    def find_weekly_files_for_period(self, start_date: pd.Timestamp, end_date: pd.Timestamp):
        """
        Search for weekly files whose date ranges overlap [start_date, end_date].
        Returns list of file paths (may be empty).
        """
        if not os.path.exists(self.weekly_path):
            print(f"[Evaluation] Weekly path does not exist: {self.weekly_path}")
            return []

        candidates = [
            f for f in os.listdir(self.weekly_path) 
            if ("_weekly_" in f or "Sales_Data_Week" in f) and f.endswith(".xlsx")
        ]
        print(f"[Evaluation] Found {len(candidates)} candidate weekly files")
        
        matches = []
        for fname in candidates:
            # Extract date from filename (YYYY-MM-DD or YYYYMMDD)
            m = re.search(r"(\d{4}-\d{2}-\d{2})", fname)
            if m:
                file_start = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            else:
                m2 = re.search(r"(\d{8})", fname)
                if m2:
                    file_start = datetime.strptime(m2.group(1), "%Y%m%d").date()
                else:
                    continue

            file_end = file_start + timedelta(days=6)
            period_start = start_date.date()
            period_end = end_date.date()
            
            # Check overlap
            overlaps = not (file_end < period_start or file_start > period_end)
            
            if overlaps:
                full_path = os.path.join(self.weekly_path, fname)
                matches.append(full_path)
                print(f"[Evaluation] Found matching weekly file: {fname} ({file_start} to {file_end})")

        # Sort by creation time ascending
        matches = sorted(matches, key=lambda p: os.path.getctime(p))
        return matches


def evaluate_forecast_json(
    user_id: str,
    forecast_json_path: str,
    weekly_data_dir: str,
    output_dir: str,
    horizons: list = [7, 30, 90]
) -> dict:
    """
    Evaluate an existing forecast JSON against available weekly actuals.
    
    Args:
        user_id: User ID
        forecast_json_path: Path to the forecast JSON file
        weekly_data_dir: Path to weekly data directory
        output_dir: Path to save evaluation JSON
        horizons: List of forecast horizons to evaluate
    
    Returns:
        Evaluation result dict with overall metrics and evaluation_date
    """
    
    print(f"\n[Evaluation Service] Evaluating forecast for user {user_id}")
    print(f"  Forecast JSON: {forecast_json_path}")
    print(f"  Weekly data dir: {weekly_data_dir}")
    
    # Load forecast JSON
    try:
        with open(forecast_json_path, 'r') as f:
            forecast_data = json.load(f)
        print(f"  ✓ Loaded forecast JSON")
    except Exception as e:
        print(f"  ✗ Failed to load forecast JSON: {e}")
        return {"error": str(e), "success": False}
    
    # Initialize weekly file finder
    finder = WeeklyFileFinder(weekly_data_dir)
    
    # Evaluate each horizon
    evaluation_results = {
        "user_id": user_id,
        "evaluation_date": datetime.now().isoformat(),
        "forecast_json": os.path.basename(forecast_json_path),
        "horizons": {}
    }
    
    for horizon in horizons:
        horizon_key = str(horizon)
        if horizon_key not in forecast_data.get("forecasts", {}):
            print(f"  No {horizon}-day forecast found")
            continue
        
        forecast_list = forecast_data["forecasts"][horizon_key]
        if not forecast_list:
            print(f"  Empty {horizon}-day forecast")
            continue
        
        # Convert forecast to DataFrame
        fdf = pd.DataFrame(forecast_list)
        fdf["Date"] = pd.to_datetime(fdf["Date"])
        
        # Get actual forecast date range from DataFrame (not computed)
        horizon_start = fdf["Date"].min()
        horizon_end = fdf["Date"].max()
        print(f"\n  Evaluating {horizon}-day forecast:")
        print(f"    Date range: {horizon_start.date()} to {horizon_end.date()}")
        
        # Find matching weekly files
        matches = finder.find_weekly_files_for_period(horizon_start, horizon_end)
        if not matches:
            print(f"    No weekly files found for this period")
            evaluation_results["horizons"][horizon_key] = {
                "status": "no_actuals",
                "note": "No weekly actuals found for evaluation"
            }
            continue
        
        # Load and concat matching weekly files
        dfs = []
        for weekly_path in matches:
            try:
                w = pd.read_excel(weekly_path)
                w["Date"] = pd.to_datetime(w["Date"])
                if {"Date", "Product_ID", "Units_Sold"}.issubset(set(w.columns)):
                    dfs.append(w[["Date", "Product_ID", "Units_Sold"]])
                    print(f"    Loaded weekly file: {os.path.basename(weekly_path)}")
                else:
                    print(f"    ✗ Weekly file missing required columns: {weekly_path}")
            except Exception as e:
                print(f"    ✗ Failed to load weekly file {weekly_path}: {e}")
        
        if not dfs:
            evaluation_results["horizons"][horizon_key] = {
                "status": "no_actuals",
                "note": "Could not load weekly actuals"
            }
            continue
        
        # Evaluate
        actuals_df = pd.concat(dfs, ignore_index=True)
        eval_df, overall = evaluate_forecasts_against_actuals(fdf, actuals_df)
        
        if eval_df.empty:
            print(f"    No matching product-dates for evaluation")
            evaluation_results["horizons"][horizon_key] = {
                "status": "no_overlap",
                "note": "No overlapping forecast vs actual dates"
            }
            continue
        
        # Store results
        overall_metrics = overall["overall"]
        # Prepare per-product breakdown (make JSON-serializable)
        per_product = []
        try:
            pd_records = eval_df.fillna(0).to_dict(orient="records")
            for row in pd_records:
                per_product.append({
                    "Product_ID": str(row.get("Product_ID")),
                    "Records": int(row.get("Records", 0)),
                    "RMSE": round(float(row.get("RMSE")) , 4) if row.get("RMSE") is not None else None,
                    "MAE": round(float(row.get("MAE")) , 4) if row.get("MAE") is not None else None,
                    "MAPE": round(float(row.get("MAPE")) , 4) if row.get("MAPE") is not None else None,
                })
        except Exception:
            per_product = []

        evaluation_results["horizons"][horizon_key] = {
            "status": "evaluated",
            "records": overall["n"],
            "metrics": {
                "RMSE": round(overall_metrics["RMSE"], 4) if overall_metrics["RMSE"] is not None else None,
                "MAE": round(overall_metrics["MAE"], 4) if overall_metrics["MAE"] is not None else None,
                "MAPE": round(overall_metrics["MAPE"], 4) if overall_metrics["MAPE"] is not None else None,
            },
            "per_product_count": len(eval_df),
            "per_product": per_product
        }

        print(f"    ✓ Evaluated {overall['n']} records")
        print(f"      RMSE: {overall_metrics['RMSE']:.4f}, MAE: {overall_metrics['MAE']:.4f}, MAPE: {overall_metrics['MAPE']:.2f}%")
    
    # Save evaluation JSON
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        forecast_basename = Path(forecast_json_path).stem  # e.g., "forecast_20251110_to_20251116"
        output_filename = f"evaluation_{forecast_basename}_{timestamp}.json"
        output_path = os.path.join(output_dir, output_filename)
        
        with open(output_path, 'w') as f:
            json.dump(evaluation_results, f, indent=2)
        
        print(f"\n  ✓ Saved evaluation to: {output_filename}")
        evaluation_results["success"] = True
        evaluation_results["output_path"] = output_path
        
    except Exception as e:
        print(f"  ✗ Failed to save evaluation JSON: {e}")
        evaluation_results["success"] = False
        evaluation_results["error"] = str(e)
    
    return evaluation_results


def evaluate_previous_forecasts_if_applicable(
    user_id: str,
    forecast_dir: str,
    weekly_data_dir: str,
    eval_output_dir: str,
    horizons: list = [7, 30, 90]
) -> list:
    """
    Find any PREVIOUS forecasts that now have overlapping actuals.
    This function is called when NEW actuals arrive (e.g., week 2 data)
    to evaluate OLDER forecasts (e.g., week 1 forecast) against the new data.
    
    Returns:
        List of evaluation results for each previous forecast that was evaluated
    """
    print(f"\n[Evaluation Service] Checking for previous forecasts to evaluate (user {user_id})")
    
    if not os.path.exists(forecast_dir):
        print(f"  Forecast directory not found: {forecast_dir}")
        return []
    
    if not os.path.exists(weekly_data_dir):
        print(f"  Weekly data directory not found: {weekly_data_dir}")
        return []
    
    # Find ALL forecast JSONs
    forecast_files = [f for f in os.listdir(forecast_dir) if f.endswith('.json')]
    if not forecast_files:
        print(f"  No forecast JSONs found")
        return []
    
    # Sort by modification time (oldest first)
    forecast_files = sorted(
        forecast_files, 
        key=lambda f: os.path.getmtime(os.path.join(forecast_dir, f))
    )
    
    print(f"  Found {len(forecast_files)} forecast JSON(s)")
    
    # Find latest weekly file to get the date range of NEW actuals
    weekly_files = [f for f in os.listdir(weekly_data_dir) if f.endswith('.xlsx')]
    if not weekly_files:
        print(f"  No weekly actual files found")
        return []
    
    # Extract date from newest weekly file
    latest_weekly_file = sorted(weekly_files, key=lambda f: os.path.getctime(os.path.join(weekly_data_dir, f)))[-1]
    m = re.search(r"(\d{4}-\d{2}-\d{2})", latest_weekly_file)
    if m:
        latest_actual_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
    else:
        m2 = re.search(r"(\d{8})", latest_weekly_file)
        if m2:
            latest_actual_date = datetime.strptime(m2.group(1), "%Y%m%d").date()
        else:
            print(f"  Could not extract date from latest weekly file: {latest_weekly_file}")
            return []
    
    latest_actual_start = latest_actual_date
    latest_actual_end = latest_actual_date + timedelta(days=6)
    print(f"  Latest actuals date range: {latest_actual_start} to {latest_actual_end}")
    
    # Evaluate each forecast that was generated BEFORE these new actuals
    evaluation_results = []
    
    for forecast_file in forecast_files:
        forecast_path = os.path.join(forecast_dir, forecast_file)
        forecast_mtime = datetime.fromtimestamp(os.path.getmtime(forecast_path))
        
        # Load forecast to get its date range
        try:
            with open(forecast_path, 'r') as f:
                fdata = json.load(f)
        except Exception as e:
            print(f"  ✗ Failed to load {forecast_file}: {e}")
            continue
        
        # Extract forecast date ranges (min/max from all horizons)
        forecast_dates = []
        for horizon_key, forecast_list in fdata.get("forecasts", {}).items():
            if forecast_list:
                fdf = pd.DataFrame(forecast_list)
                if "Date" in fdf.columns:
                    fdf["Date"] = pd.to_datetime(fdf["Date"])
                    forecast_dates.extend(fdf["Date"].dt.date.tolist())
        
        if not forecast_dates:
            print(f"  - {forecast_file}: No valid forecast dates found, skipping")
            continue
        
        forecast_start = min(forecast_dates)
        forecast_end = max(forecast_dates)
        
        # Check if this forecast's dates overlap with the NEW actuals
        # If forecast was generated BEFORE the new actuals, it might now be evaluable
        forecast_is_before_actuals = forecast_end < latest_actual_end
        overlap_exists = not (forecast_end < latest_actual_start or forecast_start > latest_actual_end)
        
        print(f"  - {forecast_file}:")
        print(f"      Generated: {forecast_mtime.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"      Forecast dates: {forecast_start} to {forecast_end}")
        print(f"      Overlaps with {latest_actual_start} to {latest_actual_end}? {overlap_exists}")
        
        if not overlap_exists:
            print(f"      ℹ️  No overlap, cannot evaluate yet")
            continue
        
        # This forecast can now be evaluated! Run evaluation
        print(f"      ✓ Evaluating...")
        result = evaluate_forecast_json(
            user_id=user_id,
            forecast_json_path=forecast_path,
            weekly_data_dir=weekly_data_dir,
            output_dir=eval_output_dir,
            horizons=horizons
        )
        
        if result.get("success"):
            evaluation_results.append(result)
            print(f"        ✓ Successfully evaluated")
    
    return evaluation_results


if __name__ == "__main__":
    # Example usage for testing
    if len(sys.argv) < 2:
        print("Usage: python evaluationService.py <user_id> [forecast_json_path]")
        sys.exit(1)
    
    user_id = sys.argv[1]
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    FORECAST_DIR = os.path.join(BASE_DIR, "../backend/files/forecastData")
    WEEKLY_DIR = os.path.join(BASE_DIR, "../backend/files/weeklyData")
    EVAL_OUTPUT_DIR = os.path.join(BASE_DIR, "reports/evaluation")
    
    # If specific forecast JSON provided, use it; otherwise find the latest
    if len(sys.argv) > 2:
        forecast_json_path = sys.argv[2]
    else:
        user_forecast_dir = os.path.join(FORECAST_DIR, f"user_{user_id}")
        json_files = [f for f in os.listdir(user_forecast_dir) if f.endswith('.json')]
        json_files = sorted(json_files, key=lambda f: os.path.getctime(os.path.join(user_forecast_dir, f)))
        if not json_files:
            print(f"No forecast JSON found for user {user_id}")
            sys.exit(1)
        forecast_json_path = os.path.join(user_forecast_dir, json_files[-1])
    
    user_weekly_dir = os.path.join(WEEKLY_DIR, f"user_{user_id}")
    user_eval_dir = os.path.join(EVAL_OUTPUT_DIR, f"user_{user_id}")
    
    result = evaluate_forecast_json(
        user_id=user_id,
        forecast_json_path=forecast_json_path,
        weekly_data_dir=user_weekly_dir,
        output_dir=user_eval_dir
    )
    
    print(f"\nEvaluation Result: {result}")
