# ml-service/fix_norm_stats.py
"""
Fix existing norm_stats.json files by adding missing avg_unit_price.
This script reads the original dataset and updates all model metadata.

Usage:
    python fix_norm_stats.py <user_id>
Example:
    python fix_norm_stats.py 4
"""

import os
import sys
import json
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEAN_DIR = os.path.join(BASE_DIR, "../backend/files/cleanData")
MODEL_DIR = os.path.join(BASE_DIR, "models")


def load_merged_dataset(user_id: str):
    """Load the merged 3-year dataset"""
    clean_path = os.path.join(CLEAN_DIR, f"user_{user_id}")
    
    if not os.path.exists(clean_path):
        raise FileNotFoundError(f"No cleaned data found for user {user_id}")
    
    files = os.listdir(clean_path)
    merged_files = [f for f in files if f.startswith("merged_3yr_sales") and f.endswith(".xlsx")]
    
    if not merged_files:
        raise FileNotFoundError("No merged dataset found")
    
    latest_merged = max(
        merged_files,
        key=lambda f: os.path.getctime(os.path.join(clean_path, f))
    )
    
    file_path = os.path.join(clean_path, latest_merged)
    print(f"📂 Loading dataset: {file_path}")
    
    df = pd.read_excel(file_path)
    print(f"✅ Loaded {len(df)} records with {df['Product_ID'].nunique()} products\n")
    
    return df


def calculate_avg_unit_prices(df):
    """Calculate average unit price per product"""
    print("💰 Calculating average unit prices per product...")
    
    avg_prices = df.groupby("Product_ID").agg({
        "Product_Name": "first",
        "Category": "first",
        "Avg_Unit_Price": "mean"
    }).reset_index()
    
    avg_prices.columns = ["Product_ID", "Product_Name", "Category", "Avg_Unit_Price"]
    
    print(f"✅ Calculated prices for {len(avg_prices)} products\n")
    
    return avg_prices


def update_norm_stats(user_id: str, avg_prices_df):
    """Update all norm_stats.json files with avg_unit_price"""
    user_model_dir = os.path.join(MODEL_DIR, f"user_{user_id}")
    
    if not os.path.exists(user_model_dir):
        raise FileNotFoundError(f"No models found for user {user_id}")
    
    product_dirs = [
        d for d in os.listdir(user_model_dir)
        if os.path.isdir(os.path.join(user_model_dir, d)) and d.startswith("product_")
    ]
    
    if not product_dirs:
        raise FileNotFoundError("No product model directories found")
    
    print(f"🔧 Updating {len(product_dirs)} norm_stats.json files...")
    print("="*70 + "\n")
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    for product_dir in product_dirs:
        product_path = os.path.join(user_model_dir, product_dir)
        stats_path = os.path.join(product_path, "norm_stats.json")
        
        try:
            # Load existing norm_stats
            with open(stats_path, "r") as f:
                stats = json.load(f)
            
            product_id = stats["product_id"]
            product_name = stats.get("product_name", "Unknown")
            
            # Check if avg_unit_price already exists
            if "avg_unit_price" in stats:
                print(f"⏭️  {product_name} (ID: {product_id}) - Already has avg_unit_price, skipping")
                skipped_count += 1
                continue
            
            # Get avg_unit_price from dataset
            price_row = avg_prices_df[avg_prices_df["Product_ID"] == product_id]
            
            if price_row.empty:
                print(f"⚠️  {product_name} (ID: {product_id}) - Not found in dataset!")
                error_count += 1
                continue
            
            avg_unit_price = float(price_row["Avg_Unit_Price"].iloc[0])
            
            # Add avg_unit_price to stats
            stats["avg_unit_price"] = avg_unit_price
            
            # Save updated stats
            with open(stats_path, "w") as f:
                json.dump(stats, f, indent=4)
            
            print(f"✅ {product_name} (ID: {product_id}) - Added avg_unit_price: ₱{avg_unit_price:.2f}")
            updated_count += 1
        
        except Exception as e:
            print(f"❌ Error updating {product_dir}: {str(e)}")
            error_count += 1
    
    print("\n" + "="*70)
    print("🎉 Update Summary:")
    print(f"   ✅ Updated: {updated_count} files")
    print(f"   ⏭️  Skipped: {skipped_count} files (already had avg_unit_price)")
    print(f"   ❌ Errors: {error_count} files")
    print("="*70 + "\n")
    
    if updated_count > 0:
        print("✅ All models are now ready for forecasting!")
    elif skipped_count == len(product_dirs):
        print("ℹ️  All models already have avg_unit_price - no updates needed.")
    else:
        print("⚠️  Some models could not be updated. Check errors above.")


def main():
    if len(sys.argv) < 2:
        print("\n❌ Error: User ID required")
        print("Usage: python fix_norm_stats.py <user_id>")
        print("Example: python fix_norm_stats.py 4\n")
        sys.exit(1)
    
    user_id = sys.argv[1]
    
    print("\n" + "="*70)
    print(f"🔧 Fixing norm_stats.json for User {user_id}")
    print("="*70 + "\n")
    
    try:
        # Step 1: Load dataset
        df = load_merged_dataset(user_id)
        
        # Step 2: Calculate average prices
        avg_prices = calculate_avg_unit_prices(df)
        
        # Step 3: Update all norm_stats.json files
        update_norm_stats(user_id, avg_prices)
        
        print("\n✅ Process completed successfully!")
        print("🚀 You can now run: python forecastModel.py", user_id, "\n")
    
    except Exception as e:
        print(f"\n❌ Process failed: {str(e)}\n")
        raise


if __name__ == "__main__":
    main()