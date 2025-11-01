# ml-service/processData.py
import os
import pandas as pd
import numpy as np
from datetime import datetime

UPLOAD_DIR = "../backend/files/salesData"   # where uploaded files go
CLEAN_DIR = "../backend/files/cleanData"    # where processed files will be saved

def preprocess_sales_data(file_path: str, output_path: str):
    """
    Cleans and preprocesses transactional sales data for LSTM + XGBoost forecasting.
    """

    print(f"Reading sales data from: {file_path}")
    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)

    # --- Step 1: Basic Cleaning ---
    print("Cleaning raw data...")
    df.columns = df.columns.str.strip()
    df = df.drop_duplicates()
    df = df.dropna(subset=["Date", "Product_ID", "Product_Name", "Total_Amount", "Quantity"])

    # Convert date/time columns to datetime format
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date"])

    # Fix invalid or negative values
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

    # Lag features (previous day, week, month)
    for lag in [1, 7, 30]:
        agg[f"Sales_Lag_{lag}"] = agg.groupby("Product_ID")["Total_Sales"].shift(lag)

    # Rolling averages (trend smoothers)
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

    # Save processed file
    agg.to_excel(output_path, index=False)
    print(f"Processed data saved to: {output_path}")
    return output_path


def process_latest_upload():
    """
    Automatically find and process the most recently uploaded sales file.
    """
    print("Scanning uploads directory for latest file...")
    files = [
        f for f in os.listdir(UPLOAD_DIR)
        if f.endswith((".xlsx", ".csv")) and not f.endswith("_processed.xlsx")
    ]
    if not files:
        print("No sales files found in uploads folder.")
        return None

    # Find most recent file
    latest_file = max(files, key=lambda f: os.path.getctime(os.path.join(UPLOAD_DIR, f)))
    input_path = os.path.join(UPLOAD_DIR, latest_file)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Save cleaned file to cleanData folder
    if not os.path.exists(CLEAN_DIR):
        os.makedirs(CLEAN_DIR)
    output_path = os.path.join(CLEAN_DIR, f"{latest_file.split('.')[0]}_processed_{timestamp}.xlsx")


    print(f"Found latest file: {latest_file}")
    print("Starting preprocessing...")
    preprocess_sales_data(input_path, output_path)
    print("Processing complete.")

    return output_path


if __name__ == "__main__":
    process_latest_upload()
