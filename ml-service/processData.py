# ml-service/processData.py
import os
import pandas as pd
import numpy as np
from datetime import datetime

UPLOAD_DIR = "../backend/files/salesData"   # where uploaded files go
CLEAN_DIR = "../backend/files/cleanData"    # where processed files will be saved


# ==========================================
# UTILITIES
# ==========================================
def ensure_user_folder(base_dir: str, user_id: str) -> str:
    """
    Ensure user-specific directory exists under base_dir.
    """
    user_dir = os.path.join(base_dir, f"user_{user_id}")
    os.makedirs(user_dir, exist_ok=True)
    return user_dir


# ==========================================
# MAIN PREPROCESS FUNCTION
# ==========================================
def preprocess_sales_data(file_path: str, output_path: str):
    """
    Cleans and preprocesses transactional sales data for LSTM + XGBoost forecasting.
    """
    print(f"Reading sales data from: {file_path}")
    if file_path.endswith(".csv"):
        df = pd.read_csv(
            file_path,
            encoding="utf-8",
            on_bad_lines="skip",
            sep=",",
            quotechar='"',
            engine="python"
        )
    else:
        df = pd.read_excel(file_path)

    # --- Step 1: Basic Cleaning ---
    print("Cleaning raw data...")
    df.columns = df.columns.str.strip()
    df = df.drop_duplicates()
    df = df.dropna(subset=["Date", "Product_ID", "Product_Name", "Total_Amount", "Quantity"])

    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])

    numeric_cols = ["Quantity", "Unit_Price", "Discount", "Total_Amount"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df.loc[df[col] < 0, col] = np.nan
    df = df.dropna(subset=numeric_cols)

    # --- Step 2: Aggregate ---
    print("Aggregating daily sales data...")
    agg = (
        df.groupby(["Date", "Product_ID", "Product_Name", "Category"])
        .agg(
            Total_Transactions=("Transaction_Id", "nunique"),
            Units_Sold=("Quantity", "sum"),
            Avg_Unit_Price=("Unit_Price", "mean"),
            Avg_Discount=("Discount", "mean"),
            Total_Sales=("Total_Amount", "sum"),
        )
        .reset_index()
    )

    # --- Step 3: Feature Engineering ---
    print("Generating features...")
    agg["Promotion_Flag"] = np.where(agg["Avg_Discount"] > 0, 1, 0)
    agg["Day_of_Week"] = agg["Date"].dt.dayofweek + 1
    agg["Month"] = agg["Date"].dt.month
    agg["Week_of_Year"] = agg["Date"].dt.isocalendar().week
    agg["Quarter"] = agg["Date"].dt.quarter
    agg["Is_Weekend"] = agg["Day_of_Week"].isin([6, 7]).astype(int)

    # Rolling + Lag Features
    print("Computing rolling & lag features...")
    agg = agg.sort_values(["Product_ID", "Date"]).reset_index(drop=True)

    for lag in [1, 7, 30]:
        agg[f"Sales_Lag_{lag}"] = agg.groupby("Product_ID")["Total_Sales"].shift(lag)

    for window in [7, 30]:
        agg[f"Rolling_{window}d_Sales"] = (
            agg.groupby("Product_ID")["Total_Sales"]
            .transform(lambda x: x.rolling(window, min_periods=1).mean())
        )

    # --- Step 5: Trend Index ---
    print("Calculating trend index...")
    def rolling_trend(x):
        if len(x) < 2:
            return 0
        y = np.arange(len(x))
        return np.polyfit(y, x, 1)[0]

    agg["Trend_Index"] = (
        agg.groupby("Product_ID")["Total_Sales"]
        .transform(lambda x: x.rolling(14, min_periods=5).apply(rolling_trend, raw=False))
    )

    # --- Step 6: Normalize Sales (for LSTM) ---
    print("Normalizing sales values...")
    agg["Normalized_Sales"] = (
        agg.groupby("Product_ID")["Total_Sales"]
        .transform(lambda x: (x - x.min()) / (x.max() - x.min() + 1e-9))
    )

    #  Save processed file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    agg.to_excel(output_path, index=False)
    print(f"Processed data saved to: {output_path}")
    return output_path


# ==========================================
# POST-PROCESS VALIDATION & MERGING
# ==========================================
def validate_data_span(user_id):
    user_clean_dir = ensure_user_folder(CLEAN_DIR, user_id)
    files = [f for f in os.listdir(user_clean_dir) if "_processed_" in f and f.endswith(".xlsx")]
    if len(files) < 3:
        raise ValueError(
            f" Only {len(files)} processed file(s) found. "
            f"At least 3 years of sales data are required before training."
        )

    all_data = []
    for file in files:
        df = pd.read_excel(os.path.join(user_clean_dir, file))
        all_data.append(df)

    merged = pd.concat(all_data, ignore_index=True)
    merged["Date"] = pd.to_datetime(merged["Date"], errors="coerce")
    merged = merged.dropna(subset=["Date"])

    min_date = merged["Date"].min()
    max_date = merged["Date"].max()
    span_years = (max_date - min_date).days / 365

    print(f" Data covers from {min_date.date()} to {max_date.date()} (~{span_years:.2f} years)")
    if span_years < 3:
        raise ValueError(
            f" Insufficient historical data: only {span_years:.2f} years detected. "
            "Please upload at least 3 years of consistent sales data before training."
        )

    print("Data span validated — 3 years or more available.")
    return merged


def merge_multi_year_data(user_id):
    print(f" Merging multi-year processed files for user {user_id}...")
    
    # ✅ Check if merge already exists from last 5 minutes
    merged_dir = ensure_user_folder(CLEAN_DIR, user_id)
    existing_merged = [f for f in os.listdir(merged_dir) 
                    if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
    
    if existing_merged:
        latest_merged = max(existing_merged, 
                        key=lambda f: os.path.getctime(os.path.join(merged_dir, f)))
        latest_time = os.path.getctime(os.path.join(merged_dir, latest_merged))
        
        # If merged file created within last 5 minutes, skip
        if (datetime.now().timestamp() - latest_time) < 300:
            print(f" ℹ️  Recent merge found ({latest_merged}), skipping duplicate merge.")
            return os.path.join(merged_dir, latest_merged)
    
    validated_df = validate_data_span(user_id)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    merged_path = os.path.join(merged_dir, f"merged_3yr_sales_{timestamp}.xlsx")

    validated_df.to_excel(merged_path, index=False)
    print(f" Multi-year merged dataset saved to: {merged_path}")
    return merged_path


# ==========================================
# MAIN PROCESS WRAPPER
# ==========================================
def process_latest_upload(user_id=None):
    base_path = UPLOAD_DIR if user_id is None else os.path.join(UPLOAD_DIR, f"user_{user_id}")
    if not os.path.exists(base_path):
        print(f"No directory for user {user_id}")
        return None

    files = [f for f in os.listdir(base_path) if f.endswith((".xlsx", ".csv"))]
    if not files:
        print(f"No sales files found for user {user_id}.")
        return None

    latest_file = max(files, key=lambda f: os.path.getctime(os.path.join(base_path, f)))
    input_path = os.path.join(base_path, latest_file)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    user_clean_dir = ensure_user_folder(CLEAN_DIR, user_id or "general")
    output_path = os.path.join(
        user_clean_dir, f"{latest_file.split('.')[0]}_processed_{timestamp}.xlsx"
    )

    print(f"Processing latest file for user {user_id}: {latest_file}")
    preprocess_sales_data(input_path, output_path)
    print("File processed successfully.")

    processed_files = [f for f in os.listdir(user_clean_dir) if "_processed_" in f and f.endswith(".xlsx")]
    if len(processed_files) >= 3:
        print(f"Detected {len(processed_files)} processed files — validating data span...")
        try:
            merge_multi_year_data(user_id)
        except ValueError as e:
            print(str(e))
    else:
        print(f"User {user_id} currently has {len(processed_files)} processed file(s).")
        print("Training blocked — upload at least 3 years of sales data.")

    return output_path


if __name__ == "__main__":
    import sys
    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    process_latest_upload(user_id)