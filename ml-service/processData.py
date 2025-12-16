# ml-service/processData.py
import os
import pandas as pd
import numpy as np
from datetime import datetime

UPLOAD_DIR = "../backend/files/salesData"
CLEAN_DIR = "../backend/files/cleanData"
WEEKLY_DIR = "../backend/files/weeklyData" 


def ensure_user_folder(base_dir: str, user_id: str) -> str:
    """Ensure user-specific directory exists"""
    user_dir = os.path.join(base_dir, f"user_{user_id}")
    os.makedirs(user_dir, exist_ok=True)
    return user_dir

def parse_dates_safely(df: pd.DataFrame) -> pd.DataFrame:
    """
    FIXED: Intelligent date parsing that handles DD/MM/YYYY format correctly
    Always tries DD/MM/YYYY first since that's your data format
    """
    print("  Parsing dates intelligently...")
    
    # Strip whitespace from date column
    df["Date"] = df["Date"].astype(str).str.strip()
    
    # Try to infer the format from first valid date
    sample_date = df["Date"].dropna().iloc[0] if len(df["Date"].dropna()) > 0 else None
    
    if sample_date:
        # Check if it looks like DD/MM/YYYY (day > 12)
        parts = str(sample_date).split('/')
        if len(parts) == 3:
            first_num = int(parts[0])
            # If first number > 12, it MUST be day (DD/MM/YYYY)
            if first_num > 12:
                print(f"     Detected DD/MM/YYYY format (sample: {sample_date})")
                # Force strict format parsing (no inference)
                df["Date"] = pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce")
            else:
                # Ambiguous (day <= 12) - try DD/MM/YYYY first (your data format)
                print(f"     Ambiguous date format - trying DD/MM/YYYY first (sample: {sample_date})")
                df["Date"] = pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce")
                
                # Check if parsing worked (if all NaN, try MM/DD/YYYY as fallback)
                if df["Date"].isna().all():
                    print(f"     DD/MM/YYYY parsing failed - trying MM/DD/YYYY fallback")
                    df["Date"] = pd.to_datetime(df["Date"], format="%m/%d/%Y", errors="coerce")
        else:
            # Not slash format, let pandas handle it
            df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    else:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    
    # Show parsed date range
    if not df["Date"].isna().all():
        min_date = df["Date"].min()
        max_date = df["Date"].max()
        print(f" Parsed date range: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}")
    else:
        print(" WARNING: All dates failed to parse!")
    
    return df

# ==========================================
# TRAINING DATA PREPROCESSING (3-YEAR DATA)
# ==========================================
def preprocess_training_data(file_path: str, output_path: str):
    """
    Full preprocessing for 3-YEAR training data.
    Includes: cleaning, aggregation, feature engineering, lags, rolling windows.
    """
    print(f"TRAINING MODE: Reading data from: {file_path}")
    
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

    # Basic cleaning
    print("  Cleaning raw data...")
    df.columns = df.columns.str.strip()
    df = df.drop_duplicates()
    df = df.dropna(subset=["Date", "Product_ID", "Product_Name", "Total_Amount", "Quantity"])

    # ✅ FIX: Use intelligent date parsing
    df = parse_dates_safely(df)
    df = df.dropna(subset=["Date"])


    numeric_cols = ["Quantity", "Unit_Price", "Discount", "Total_Amount"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df.loc[df[col] < 0, col] = np.nan
    df = df.dropna(subset=numeric_cols)

    # Aggregate
    print("  Aggregating daily sales...")
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

    # Feature engineering
    print("  Generating features...")
    agg["Promotion_Flag"] = np.where(agg["Avg_Discount"] > 0, 1, 0)
    agg["Day_of_Week"] = agg["Date"].dt.dayofweek + 1
    agg["Month"] = agg["Date"].dt.month
    agg["Week_of_Year"] = agg["Date"].dt.isocalendar().week
    agg["Quarter"] = agg["Date"].dt.quarter
    agg["Is_Weekend"] = agg["Day_of_Week"].isin([6, 7]).astype(int)

    # Lag features
    print("  Computing lag features...")
    agg = agg.sort_values(["Product_ID", "Date"]).reset_index(drop=True)
    for lag in [1, 7, 30]:
        agg[f"Sales_Lag_{lag}"] = agg.groupby("Product_ID")["Total_Sales"].shift(lag)

    # Rolling features
    for window in [7, 30]:
        agg[f"Rolling_{window}d_Sales"] = (
            agg.groupby("Product_ID")["Total_Sales"]
            .transform(lambda x: x.rolling(window, min_periods=1).mean())
        )

    # Trend index
    print("  Calculating trend index...")
    def rolling_trend(x):
        if len(x) < 2:
            return 0
        y = np.arange(len(x))
        return np.polyfit(y, x, 1)[0]

    agg["Trend_Index"] = (
        agg.groupby("Product_ID")["Total_Sales"]
        .transform(lambda x: x.rolling(14, min_periods=5).apply(rolling_trend, raw=False))
    )

    # Normalize sales
    print("  Normalizing sales values...")
    agg["Normalized_Sales"] = (
        agg.groupby("Product_ID")["Total_Sales"]
        .transform(lambda x: (x - x.min()) / (x.max() - x.min() + 1e-9))
    )

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    agg.to_excel(output_path, index=False)
    print(f" Training data saved to: {output_path}")
    return output_path


# ==========================================
# WEEKLY DATA PREPROCESSING (FORECASTING ONLY)
# ==========================================
def preprocess_weekly_data(file_path: str, output_path: str):
    """
    Lightweight preprocessing for WEEKLY sales data.
    NO LAGS, NO ROLLING WINDOWS, NO TRENDS.
    """
    print(f" WEEKLY MODE: Reading data from: {file_path}")

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

    # Basic cleaning
    print("  Cleaning weekly data...")
    df.columns = df.columns.str.strip()
    df = df.drop_duplicates()
    df = df.dropna(subset=["Date", "Product_ID", "Product_Name", "Total_Amount", "Quantity"])

    # Use intelligent date parsing
    df = parse_dates_safely(df)
    df = df.dropna(subset=["Date"])

    # Safe numeric conversion
    numeric_cols = ["Quantity", "Unit_Price", "Discount", "Total_Amount"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df.loc[df[col] < 0, col] = np.nan

    df = df.dropna(subset=["Quantity", "Total_Amount"])

    # Simple aggregation (NO feature engineering)
    print("  Aggregating weekly daily sales...")
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

    # VERIFY: Show sample of processed data
    if len(agg) > 0:
        print(f"  Processed {len(agg)} records")
        print(f"  Sample dates: {agg['Date'].head(3).tolist()}")
    else:
        print("  WARNING: No records after aggregation!")

    # Save to WEEKLY folder
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    agg.to_excel(output_path, index=False)

    print(f"Weekly data saved to: {output_path}\n")
    return output_path


# ==========================================
# VALIDATION & MERGING (TRAINING DATA ONLY)
# ==========================================
def validate_data_span(user_id):
    """Check if user has 3+ years of training data"""
    user_clean_dir = ensure_user_folder(CLEAN_DIR, user_id)
    files = [f for f in os.listdir(user_clean_dir) if "_processed_" in f and f.endswith(".xlsx")]
    
    if len(files) < 3:
        raise ValueError(
            f"Only {len(files)} processed file(s) found. "
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

    print(f" Data span: {min_date.date()} to {max_date.date()} (~{span_years:.2f} years)")
    
    if span_years < 3:
        raise ValueError(
            f"Insufficient historical data: only {span_years:.2f} years detected. "
            "Please upload at least 3 years of consistent sales data before training."
        )

    print(" Data span validated — 3 years or more available.")
    return merged


def merge_multi_year_data(user_id):
    """Merge 3-year training files into one dataset"""
    print(f" Merging multi-year training data for user {user_id}...")

    merged_dir = ensure_user_folder(CLEAN_DIR, user_id)
    
    # Check for recent merges (skip if merged < 5 min ago)
    existing_merged = [
        f for f in os.listdir(merged_dir)
        if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")
    ]

    if existing_merged:
        latest_merged = max(
            existing_merged,
            key=lambda f: os.path.getctime(os.path.join(merged_dir, f))
        )
        latest_time = os.path.getctime(os.path.join(merged_dir, latest_merged))

        if (datetime.now().timestamp() - latest_time) < 300:
            print(f"ℹ  Recent merge found ({latest_merged}), skipping duplicate.")
            return os.path.join(merged_dir, latest_merged)

    # Validate and merge
    validated_df = validate_data_span(user_id)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    merged_filename = f"merged_3yr_sales_{timestamp}.xlsx"
    merged_path = os.path.join(merged_dir, merged_filename)

    validated_df.to_excel(merged_path, index=False)
    print(f" Multi-year merged dataset saved: {merged_path}")

    return merged_path


# ==========================================
# MAIN PROCESSING ROUTER
# ==========================================
def process_latest_upload(user_id: str, is_weekly: bool = False):
    """
    Main entry point for preprocessing.
    
    Args:
        user_id: User ID string
        is_weekly: True if this is a weekly forecast upload, False for training data
    """
    base_path = os.path.join(UPLOAD_DIR, f"user_{user_id}")

    if not os.path.exists(base_path):
        print(f" No directory for user {user_id}")
        return None

    files = [f for f in os.listdir(base_path) if f.endswith((".xlsx", ".csv"))]
    if not files:
        print(f" No sales files found for user {user_id}")
        return None

    latest_file = max(files, key=lambda f: os.path.getctime(os.path.join(base_path, f)))
    input_path = os.path.join(base_path, latest_file)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # ==========================================
    # WEEKLY UPLOAD → Simple processing, NO merging
    # ==========================================
    if is_weekly:
        print("\n" + "="*70)
        print(" WEEKLY UPLOAD DETECTED")
        print("="*70)
        
        user_weekly_dir = ensure_user_folder(WEEKLY_DIR, user_id)
        output_path = os.path.join(
            user_weekly_dir,
            f"{latest_file.split('.')[0]}_weekly_{timestamp}.xlsx"
        )

        preprocess_weekly_data(input_path, output_path)
        
        print("="*70)
        print("Weekly data processed successfully!")
        print("   Saved to: weeklyData folder")
        print("   NO merging performed (training data preserved)")
        print("="*70 + "\n")
        
        return output_path

    # ==========================================
    # TRAINING UPLOAD → Full processing + merging
    # ==========================================
    print("\n" + "="*70)
    print("TRAINING UPLOAD DETECTED")
    print("="*70)
    
    user_clean_dir = ensure_user_folder(CLEAN_DIR, user_id)
    output_path = os.path.join(
        user_clean_dir,
        f"{latest_file.split('.')[0]}_processed_{timestamp}.xlsx"
    )

    preprocess_training_data(input_path, output_path)
    
    # Check if we have 3+ years for merging
    processed_files = [
        f for f in os.listdir(user_clean_dir)
        if "_processed_" in f and f.endswith(".xlsx")
    ]

    print(f"\nUser {user_id} has {len(processed_files)} processed training file(s)")

    if len(processed_files) >= 3:
        print(" 3+ years detected — validating and merging...")
        try:
            merge_multi_year_data(user_id)
        except ValueError as e:
            print(f" {str(e)}")
    else:
        print(f"Need {3 - len(processed_files)} more year(s) before training can begin")

    print("="*70 + "\n")
    return output_path


if __name__ == "__main__":
    import sys
    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    is_weekly = sys.argv[2].lower() == "true" if len(sys.argv) > 2 else False
    process_latest_upload(user_id, is_weekly)