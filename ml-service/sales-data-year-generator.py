import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# ================== CONFIGURATION ==================
CONFIG = {
    "year": 2024,
    "min_quantity": 1,
    "max_quantity": 10,
    "min_tx_per_day": 200,
    "max_tx_per_day": 700,
    "min_items_per_tx": 1,
    "max_items_per_tx": 10,
    "open_hour": 8,
    "close_hour": 22,
    "output_dir": "sales_data",

    # Discount Settings
    "discount_chance_normal": 0.00,
    "discount_chance_special": 0.15,
    "promo_months": [1, 6, 11, 12],

    # Monthly Growth
    "monthly_growth": {
        1: 1.04, 2: 1.00, 3: 1.00, 4: 1.00,
        5: 1.01, 6: 1.02, 7: 1.00, 8: 1.00,
        9: 1.00, 10: 1.00, 11: 1.04, 12: 1.05
    },

    # Seasonal Category Weights
    "seasonal_weights": {
        "Beverages": {3: 1.3, 4: 1.3, 5: 1.4},
        "Noodles": {6: 1.3, 7: 1.4, 8: 1.4, 9: 1.3, 12: 1.4},
        "Snacks": {12: 1.2, 1: 1.1},
        "Frozen Food": {11: 1.2, 12: 1.3},
        "Condiments": {12: 1.2},
    },

    # Holiday multipliers (hidden in output)
    "major_holiday_boost": 1.5,
    "regular_holiday_drop": 0.6,
    "holiday_discount_chance_major": 0.25,
}

# ================== LOAD PRODUCT LIST ==================
base_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(base_dir, "Final Products List.xlsx")
products = pd.read_excel(file_path, sheet_name="Sheet1")
products.columns = ["Product_Name", "Unit_Price", "Category"]
products["Product_ID"] = [f"P{i:04d}" for i in range(1, len(products) + 1)]

# ================== LOAD HOLIDAYS ==================
holidays_path = os.path.join(base_dir, "Holidays.xlsx")
holidays_df = pd.read_excel(holidays_path)
holidays_df.columns = [col.strip().title() for col in holidays_df.columns]

# Expect columns: Date, Holiday_Name, Type (Major or Regular)
if "Date" not in holidays_df.columns or "Type" not in holidays_df.columns:
    raise ValueError("❌ 'Holidays.xlsx' must include: Date, Holiday_Name, and Type columns.")

holidays_df["Date"] = pd.to_datetime(holidays_df["Date"]).dt.date
major_holidays = set(holidays_df.loc[holidays_df["Type"].str.lower() == "major", "Date"])
regular_holidays = set(holidays_df.loc[holidays_df["Type"].str.lower() == "regular", "Date"])

# print(f" Loaded {len(major_holidays)} major and {len(regular_holidays)} regular holidays.")

# ================== GENERATION FUNCTION ==================
def generate_sales_data(config):
    year = config["year"]
    start_date = datetime(year, 1, 1)
    end_date = datetime(year, 12, 31)
    records = []
    transaction_id = 1

    while start_date <= end_date:
        current_date = start_date.date()
        month = start_date.month
        growth_multiplier = config["monthly_growth"].get(month, 1.0)
        is_special = month in config["promo_months"]

        # === Holiday influence ===
        if current_date in major_holidays:
            day_multiplier = config["major_holiday_boost"]
            discount_chance = config["holiday_discount_chance_major"]
        elif current_date in regular_holidays:
            day_multiplier = config["regular_holiday_drop"]
            discount_chance = 0.0
        else:
            day_multiplier = 1.0
            discount_chance = config["discount_chance_special"] if is_special else config["discount_chance_normal"]

        min_tx = int(config["min_tx_per_day"] * growth_multiplier * day_multiplier)
        max_tx = int(config["max_tx_per_day"] * growth_multiplier * day_multiplier)
        num_tx = random.randint(max(1, min_tx), max(1, max_tx))

        for _ in range(num_tx):
            num_items = random.randint(config["min_items_per_tx"], config["max_items_per_tx"])
            time = datetime.combine(start_date, datetime.min.time()) + timedelta(
                hours=random.randint(config["open_hour"], config["close_hour"] - 1),
                minutes=random.randint(0, 59)
            )

            # Weighted category selection (seasonal effect)
            category_weights = []
            for cat in products["Category"].unique():
                base = 1.0
                seasonal = config["seasonal_weights"].get(cat, {})
                category_weights.append(seasonal.get(month, base))
            chosen_category = random.choices(products["Category"].unique(), weights=category_weights, k=1)[0]
            category_products = products[products["Category"] == chosen_category]
            transaction_products = category_products.sample(min(num_items, len(category_products)), replace=False)

            for _, row in transaction_products.iterrows():
                quantity = random.randint(config["min_quantity"], config["max_quantity"])
                apply_discount = random.random() < discount_chance
                discount = random.choice([0.05, 0.10, 0.15, 0.20, 0.25]) if apply_discount else 0.0
                total = round(row["Unit_Price"] * quantity * (1 - discount), 2)

                records.append({
                    "Transaction_Id": f"T{year}{transaction_id:06d}",
                    "Date": start_date.strftime("%Y-%m-%d"),
                    "Time": time.strftime("%H:%M:%S"),
                    "Product_ID": row["Product_ID"],
                    "Product_Name": row["Product_Name"],
                    "Category": row["Category"],
                    "Quantity": quantity,
                    "Unit_Price": row["Unit_Price"],
                    "Discount": discount,
                    "Total_Amount": total
                })
            transaction_id += 1

        start_date += timedelta(days=1)

    return pd.DataFrame(records)


# ================== RUN ==================
if __name__ == "__main__":
    os.makedirs(CONFIG["output_dir"], exist_ok=True)
    print(f"Generating sales data for {CONFIG['year']}...")

    df = generate_sales_data(CONFIG)
    output_file = os.path.join(CONFIG["output_dir"], f"Sales_Data_Final_{CONFIG['year']}.xlsx")
    '''
    # Save as CSV
    df.to_csv(output_file, index=False)
    '''
    # Save as Excel
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Sales_Data")

    print(f"\n✅ Completed: {output_file}")
    print(f"🧾 Total records: {len(df):,}")
