import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# ==== CONFIGURATION (Simplified for 1-week generation) ===
CONFIG = {
    # YYYY - MM - DD
    "start_date": "2025-11-10",

    # Quantity settings
    "min_quantity": 1,
    "max_quantity": 10,

    # Transaction volume per day
    "min_tx_per_day": 300,
    "max_tx_per_day": 550,

    # Items per transaction (basket size)
    "min_items_per_tx": 1,
    "max_items_per_tx": 6,

    "open_hour": 8,
    "close_hour": 22,
    "output_dir": "sales_data",

    # Discount Settings
    "discount_chance_normal": 0.00,
    "discount_chance_special": 0.15,  # For promo months
    "promo_months": [1, 6, 11, 12],

    # Weekly Traffic Pattern 
    "weekday_multiplier": {
        0: 0.95,  # Monday
        1: 1.00,  # Tuesday
        2: 1.02,  # Wednesday
        3: 1.05,  # Thursday
        4: 1.15,  # Friday
        5: 1.25,  # Saturday (highest)
        6: 1.10   # Sunday
    },

    # Seasonal Category Weights
    "seasonal_weights": {
        "Beverages": {3: 1.3, 4: 1.3, 5: 1.4},
        "Noodles": {6: 1.3, 7: 1.4, 8: 1.4, 9: 1.3, 12: 1.4},
        "Snacks": {12: 1.2, 1: 1.1},
        "Frozen Food": {11: 1.2, 12: 1.3},
        "Condiments": {12: 1.2},
    },

    # Holiday Effects
    "major_holiday_boost": 1.5,
    "regular_holiday_drop": 0.6,
    "holiday_discount_chance_major": 0.25,
}

# === LOAD PRODUCTS ===
base_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(base_dir, "Final Products List.xlsx")

products = pd.read_excel(file_path, sheet_name="Sheet1")
products.columns = ["Product_Name", "Unit_Price", "Category"]
products["Product_ID"] = [f"P{i:04d}" for i in range(1, len(products) + 1)]

# Purchase probability mapping (1 = always purchased, 0 = never purchased)
purchase_prob_map = {
    "Beverages": 0.90,
    "Snacks": 0.85,
    "Noodles": 0.80,
    "Frozen Food": 0.60,
    "Condiments": 0.45,
    "Dry Food": 0.60
}

default_prob = 0.10

products["Purchase_Prob"] = products["Category"].apply(
    lambda c: purchase_prob_map.get(c, default_prob)
)

# === LOAD HOLIDAYS ===
holidays_path = os.path.join(base_dir, "Holidays.xlsx")
holidays_df = pd.read_excel(holidays_path)
holidays_df.columns = [col.strip().title() for col in holidays_df.columns]

if "Date" not in holidays_df.columns or "Type" not in holidays_df.columns:
    raise ValueError("❌ Holidays.xlsx must have: Date, Holiday_Name, Type.")

holidays_df["Date"] = pd.to_datetime(holidays_df["Date"]).dt.date
major_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "major"]["Date"])
regular_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "regular"]["Date"])


# === GENERATE 1 WEEK SALES ===
def generate_sales_data_1week(config):
    start_date = datetime.strptime(config["start_date"], "%Y-%m-%d")
    end_date = start_date + timedelta(days=6)

    records = []
    transaction_id = 1

    while start_date <= end_date:
        current_date = start_date.date()
        weekday = start_date.weekday()
        month = start_date.month

        # === WEEKDAY TRAFFIC MULTIPLIER ===
        weekday_mult = config["weekday_multiplier"].get(weekday, 1.0)

        # === PROMO MONTH DISCOUNT CHANCE ===
        is_special = month in config["promo_months"]

        # === Holiday Influence ===
        if current_date in major_holidays:
            day_multiplier = config["major_holiday_boost"]
            discount_chance = config["holiday_discount_chance_major"]
        elif current_date in regular_holidays:
            day_multiplier = config["regular_holiday_drop"]
            discount_chance = 0.0
        else:
            day_multiplier = 1.0
            discount_chance = (
                config["discount_chance_special"] if is_special
                else config["discount_chance_normal"]
            )

        # === Transactions per day ===
        min_tx = int(config["min_tx_per_day"] * weekday_mult * day_multiplier)
        max_tx = int(config["max_tx_per_day"] * weekday_mult * day_multiplier)

        num_tx = random.randint(max(1, min_tx), max(1, max_tx))

        # === Generate Transactions ===
        for _ in range(num_tx):
            num_items = random.randint(config["min_items_per_tx"], config["max_items_per_tx"])

            time = datetime.combine(start_date, datetime.min.time()) + timedelta(
                hours=random.randint(config["open_hour"], config["close_hour"] - 1),
                minutes=random.randint(0, 59)
            )

            # === Category selection with seasonal weight ===
            category_weights = []
            for cat in products["Category"].unique():
                seasonal = config["seasonal_weights"].get(cat, {})
                category_weights.append(seasonal.get(month, 1.0))

            chosen_category = random.choices(
                products["Category"].unique(), weights=category_weights, k=1
            )[0]

            category_products = products[products["Category"] == chosen_category]

            # Probability-based product filtering
            eligible = category_products[
                category_products["Purchase_Prob"].apply(lambda p: random.random() < p)
            ]

            if eligible.empty:
                eligible = category_products.sample(1)

            transaction_products = eligible.sample(
                min(num_items, len(eligible)), replace=False
            )

            for _, row in transaction_products.iterrows():
                quantity = random.randint(config["min_quantity"], config["max_quantity"])

                # Apply discount
                apply_discount = random.random() < discount_chance
                discount = (
                    random.choice([0.05, 0.10, 0.15, 0.20, 0.25])
                    if apply_discount else 0.0
                )

                total = round(row["Unit_Price"] * quantity * (1 - discount), 2)

                records.append({
                    "Transaction_Id": f"T{start_date.year}{transaction_id:06d}",
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


# === MAIN ===
if __name__ == "__main__":
    os.makedirs(CONFIG["output_dir"], exist_ok=True)
    print(f"Generating 1-week sales data starting {CONFIG['start_date']}...")

    df = generate_sales_data_1week(CONFIG)
    output_file = os.path.join(CONFIG["output_dir"], f"Sales_Data_Week_{CONFIG['start_date']}.csv")

    df.to_csv(output_file, index=False)


    print(f"\n✅ Completed: {output_file}")
    print(f"🧾 Total records: {len(df):,}")
