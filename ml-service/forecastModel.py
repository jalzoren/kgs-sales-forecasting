# ml-service/forecastModel.py
"""
Product-Level Sales Forecasting Generation Script
Generates separate forecasts for each trained product.

Usage: 
    python forecastModel.py <user_id>
Example:
    python forecastModel.py 3

Outputs:
    ../backend/files/forecastData/user_{user_id}/forecast_{timestamp}.xlsx
    Contains sheets: '7d_forecast', '30d_forecast', '90d_forecast', 'inventory_alerts'
"""

import os
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

LOOKBACK = 90
HORIZONS = [7, 30, 90]  # Forecast horizons in days
STATIC_COLS = [
    "Day_of_Week", "Month", "Week_of_Year",
    "Quarter", "Is_Weekend", "Promotion_Flag",
    "Rolling_7d_Sales", "Rolling_30d_Sales",
]


# ==========================================
# HELPER FUNCTIONS
# ==========================================
def ensure_dir(path):
    """Create directory if it doesn't exist"""
    os.makedirs(path, exist_ok=True)
    return path


def normalize_sequence(seq, mean, std):
    """Normalize sequence for LSTM input"""
    return (seq - mean) / std


def make_future_dates(last_date: pd.Timestamp, horizon_days: int):
    """Generate future dates for forecasting"""
    return [last_date + timedelta(days=i) for i in range(1, horizon_days + 1)]


def build_static_features_for_dates(dates: list):
    """Build static features (day, month, etc.) for future dates"""
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


# ==========================================
# DATA LOADER
# ==========================================
class DataLoader:
    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self.clean_path = os.path.abspath(os.path.join(CLEAN_DIR, f"user_{self.user_id}"))
        if not os.path.exists(self.clean_path):
            raise FileNotFoundError(f"No cleaned data found for user {user_id}")

    def get_merged_or_latest_file(self):
        """Get the most recent merged 3-year dataset"""
        files = os.listdir(self.clean_path)
        merged_files = [f for f in files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
        
        if merged_files:
            latest_merged = max(
                merged_files, 
                key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
            )
            return os.path.join(self.clean_path, latest_merged)
        
        # Fallback to latest processed file
        processed_files = [f for f in files if "_processed_" in f and f.endswith(".xlsx")]
        if not processed_files:
            raise FileNotFoundError(f"No processed files found for user {self.user_id}")
        
        latest = max(
            processed_files, 
            key=lambda f: os.path.getctime(os.path.join(self.clean_path, f))
        )
        return os.path.join(self.clean_path, latest)

    def load_df(self):
        """Load and return the dataset"""
        path = self.get_merged_or_latest_file()
        print(f"[DataLoader] Loading dataset: {path}")
        df = pd.read_excel(path)
        df = df.sort_values(["Product_ID", "Date"]).reset_index(drop=True)
        return df, path


# ==========================================
# MODEL LOADER (OPTIMIZED WITH PROGRESS)
# ==========================================
def load_product_models(user_id: str):
    """Load all trained product models with progress tracking"""
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
    print(f"[Models] This may take 2-3 minutes for 300 products...\n")
    
    models = {}
    for idx, product_dir in enumerate(product_dirs, 1):
        product_path = os.path.join(user_model_dir, product_dir)
        
        # Show progress every 50 products
        if idx % 50 == 0 or idx == len(product_dirs):
            progress = (idx / len(product_dirs)) * 100
            print(f"   Loading models: {idx}/{len(product_dirs)} ({progress:.0f}%)")
        
        # Load norm stats (contains product metadata)
        stats_path = os.path.join(product_path, "norm_stats.json")
        with open(stats_path, "r") as f:
            stats = json.load(f)
        
        product_id = stats["product_id"]
        
        # Load LSTM model (suppress verbose output)
        lstm_path = os.path.join(product_path, "lstm_model.keras")
        lstm_model = load_model(lstm_path, compile=False)  # ✅ Skip compilation for speed
        
        # Load XGBoost model
        xgb_path = os.path.join(product_path, "xgb_model.json")
        xgb_model = xgb.XGBRegressor()
        xgb_model.load_model(xgb_path)
        
        # Create LSTM feature extractor
        lstm_layer = lstm_model.layers[0]
        input_shape = lstm_model.input_shape[1:]
        input_layer = Input(shape=input_shape)
        feature_output = lstm_layer(input_layer, training=False)
        extractor = Model(inputs=input_layer, outputs=feature_output)
        
        models[product_id] = {
            "lstm_model": lstm_model,
            "xgb_model": xgb_model,
            "extractor": extractor,
            "stats": stats
        }
    
    print(f"\n[Models]  All {len(models)} models loaded successfully!\n")
    return models


# ==========================================
# PRODUCT FORECASTER
# ==========================================
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
        self.avg_unit_price = self.stats["avg_unit_price"]

    def prepare_recent_data(self):
        """Extract recent sales history for forecasting"""
        series = self.product_data["Units_Sold"].astype(float).fillna(0).tolist()
        last_date = pd.to_datetime(self.product_data["Date"].iloc[-1])
        return series, last_date

    def forecast_horizon(self, horizon_days: int):
        """Generate forecast for specified horizon"""
        series, last_date = self.prepare_recent_data()
        
        # Initialize rolling averages
        rolling7 = series[-7:].copy() if len(series) >= 7 else series.copy()
        rolling30 = series[-30:].copy() if len(series) >= 30 else series.copy()
        
        # Generate future dates
        future_dates = make_future_dates(last_date, horizon_days)
        future_static = build_static_features_for_dates(future_dates)
        
        # Get LSTM feature dimension
        sample_input = np.zeros((1, self.lookback, 1))
        sample_feat = self.extractor.predict(sample_input, verbose=0)
        lstm_feat_dim = sample_feat.shape[1]
        
        results = []
        current_series = series.copy()
        
        for idx, row in future_static.iterrows():
            # Prepare sequence for LSTM
            seq = np.array(current_series[-self.lookback:], dtype=float)
            if len(seq) < self.lookback:
                seq = np.concatenate([np.zeros(self.lookback - len(seq)), seq])
            
            # Normalize sequence
            seq_normalized = normalize_sequence(
                seq, 
                self.stats['mean'], 
                self.stats['std']
            )
            seq_in = seq_normalized.reshape(1, self.lookback, 1)
            
            # LSTM prediction (for reference, not used in final prediction)
            lstm_pred = float(self.lstm_model.predict(seq_in, verbose=0).reshape(-1)[0])
            
            # Extract LSTM temporal features
            lstm_features = self.extractor.predict(seq_in, verbose=0).reshape(-1)
            
            # Calculate current rolling averages
            current_rolling_7 = float(np.mean(rolling7[-7:])) if len(rolling7) >= 7 else float(np.mean(rolling7))
            current_rolling_30 = float(np.mean(rolling30[-30:])) if len(rolling30) >= 30 else float(np.mean(rolling30))
            
            # Build feature dictionary for XGBoost
            feat_dict = {
                "Day_of_Week": row["Day_of_Week"],
                "Month": row["Month"],
                "Week_of_Week": row["Week_of_Year"],
                "Quarter": row["Quarter"],
                "Is_Weekend": row["Is_Weekend"],
                "Promotion_Flag": row["Promotion_Flag"],
                "Rolling_7d_Sales": current_rolling_7,
                "Rolling_30d_Sales": current_rolling_30,
                **{f"LSTM_Feature_{i+1}": lstm_features[i] for i in range(lstm_feat_dim)}
            }
            
            # XGBoost final prediction
            X_row = pd.DataFrame([feat_dict])
            xgb_pred = float(self.xgb_model.predict(X_row)[0])
            
            # Ensure non-negative forecast
            xgb_pred = max(0, xgb_pred)
            
            # Update rolling averages for next iteration
            rolling7.append(xgb_pred)
            rolling30.append(xgb_pred)
            if len(rolling7) > 30:
                rolling7.pop(0)
            if len(rolling30) > 30:
                rolling30.pop(0)
            
            # Calculate revenue estimate
            revenue_estimate = xgb_pred * self.avg_unit_price
            
            results.append({
                "Date": row["Date"],
                "Product_ID": self.product_id,
                "Product_Name": self.product_name,
                "Category": self.category,
                "Forecast_Qty": round(xgb_pred, 2),
                "Revenue_Estimate": round(revenue_estimate, 2),
                "Avg_Unit_Price": round(self.avg_unit_price, 2)
            })
            
            current_series.append(xgb_pred)
        
        return pd.DataFrame(results)


# ==========================================
# INVENTORY RISK CALCULATOR
# ==========================================
def calculate_inventory_risk(forecast_df):
    """
    Calculate stockout risk based on sales velocity.
    
    Risk Levels:
    - HIGH: Avg daily sales > 10 units (fast-moving)
    - MEDIUM: Avg daily sales 5-10 units (moderate)
    - LOW: Avg daily sales < 5 units (slow-moving)
    """
    risk_summary = []
    
    for product_id in forecast_df["Product_ID"].unique():
        product_forecast = forecast_df[forecast_df["Product_ID"] == product_id]
        
        product_name = product_forecast["Product_Name"].iloc[0]
        category = product_forecast["Category"].iloc[0]
        
        # Calculate metrics
        forecast_7d_qty = product_forecast.head(7)["Forecast_Qty"].sum()
        forecast_30d_qty = product_forecast.head(30)["Forecast_Qty"].sum()
        avg_daily_sales = forecast_7d_qty / 7
        
        # Determine risk level
        if avg_daily_sales >= 10:
            risk_level = "HIGH"
            action = "Restock ASAP - Fast moving product"
        elif avg_daily_sales >= 5:
            risk_level = "MEDIUM"
            action = "Monitor closely - Moderate demand"
        else:
            risk_level = "LOW"
            action = "Sufficient stock - Slow moving"
        
        risk_summary.append({
            "Product_ID": product_id,
            "Product_Name": product_name,
            "Category": category,
            "7d_Forecast_Qty": round(forecast_7d_qty, 2),
            "30d_Forecast_Qty": round(forecast_30d_qty, 2),
            "Avg_Daily_Sales": round(avg_daily_sales, 2),
            "Risk_Level": risk_level,
            "Action": action
        })
    
    return pd.DataFrame(risk_summary).sort_values("Avg_Daily_Sales", ascending=False)


# ==========================================
# MAIN FORECAST PIPELINE
# ==========================================
def forecast_for_user(user_id: str):
    """Generate product-level forecasts for all trained products"""
    print("\n" + "="*70)
    print(f" Starting Product-Level Forecasting for User {user_id}")
    print("="*70 + "\n")
    
    # Load data and models
    loader = DataLoader(user_id)
    df, data_path = loader.load_df()
    models = load_product_models(user_id)
    
    print(f"[Data] Loaded {len(df)} records")
    print(f"[Models] Loaded {len(models)} product models\n")
    
    # Generate forecasts for each horizon
    all_forecasts = {horizon: [] for horizon in HORIZONS}
    
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
    
    # Combine all forecasts
    print("="*70)
    print(" Consolidating Forecasts...")
    print("="*70 + "\n")
    
    combined_forecasts = {}
    for horizon in HORIZONS:
        if all_forecasts[horizon]:
            combined_forecasts[f"{horizon}d_forecast"] = pd.concat(
                all_forecasts[horizon], 
                ignore_index=True
            )
            print(f" {horizon}-day forecast: {len(combined_forecasts[f'{horizon}d_forecast'])} records")
    
    # Calculate inventory risk alerts
    if "90d_forecast" in combined_forecasts:
        print("\n Calculating Inventory Risk Alerts...")
        inventory_alerts = calculate_inventory_risk(combined_forecasts["90d_forecast"])
        print(f" Risk assessment completed for {len(inventory_alerts)} products")
    else:
        inventory_alerts = pd.DataFrame()
    
    # Save outputs
    out_dir = ensure_dir(os.path.join(FORECAST_DIR, f"user_{user_id}"))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(out_dir, f"forecast_{timestamp}.xlsx")
    
    print(f"\n Saving forecast to: {out_path}")
    
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        for sheet_name, forecast_df in combined_forecasts.items():
            forecast_df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        if not inventory_alerts.empty:
            inventory_alerts.to_excel(writer, sheet_name="inventory_alerts", index=False)
    
    print("\n" + "="*70)
    print(" Forecasting Completed Successfully!")
    print(f"    Output file: {out_path}")
    print(f"    Forecast sheets: {list(combined_forecasts.keys())}")
    if not inventory_alerts.empty:
        print(f"    High-risk products: {len(inventory_alerts[inventory_alerts['Risk_Level'] == 'HIGH'])}")
    print("="*70 + "\n")
    
    return out_path


# ==========================================
# MAIN ENTRY POINT
# ==========================================
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