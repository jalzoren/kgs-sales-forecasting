# sales data YEAR generator — ULTRA REALISTIC VERSION (2025) — LOWER REVENUE VERSION
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# ============================= CONFIGURATION =============================
CONFIG = {
    "year": 2022,                        # Change to 2025 if you want
    "base_tx_per_day": 92,               # ↓ Reduced heavily (was 248) → ~90–130 tx/day
    "tx_variation": 0.20,                # ±20% daily random noise (slightly higher variation)

    "min_items_per_tx": 1,
    "max_items_per_tx": 5,               # Slightly lower max basket

    "open_hour": 8,
    "close_hour": 22,
    "output_dir": "sales_data",

    # Monthly growth (Dec & Jan peak, Feb low)
    "monthly_growth": {
        1: 1.12, 2: 0.85, 3: 0.92, 4: 0.94,
        5: 1.00, 6: 1.05, 7: 1.03, 8: 1.02,
        9: 0.97, 10: 0.99, 11: 1.08, 12: 1.18   # Christmas still strong but toned down
    },

    # Weekday pattern (Saturday highest)
    "weekday_multiplier": {
        0: 0.80,  # Mon
        1: 0.90,  # Tue
        2: 0.96,  # Wed
        3: 1.04,  # Thu
        4: 1.15,  # Fri
        5: 1.28,  # Sat ← peak
        6: 1.06   # Sun
    },

    "promo_months": [1, 6, 11, 12],
    "discount_chance_promo": 0.12,           # Slightly lower
    "discount_chance_holiday_major": 0.18,
    "discount_values": [0.05, 0.10, 0.15],

    "major_holiday_boost": 1.40,             # Was 1.50
    "regular_holiday_drop": 0.65,            # Was 0.62

    # Realistic category probability (slightly reduced high-margin items)
    "category_in_basket_prob": {
        "Liquor/Beverage":          0.58,    # ↓ from 0.62
        "Snacks":                   0.65,    # ↓ from 0.68
        "Noodles":                  0.53,
        "Dry Food":                 0.26,
        "Condiments":               0.17,
        "Seasoned/Sauce/Powder":    0.14,
        "Food Frozen":              0.11,
        "Food Fresh/Meat/Sidedish": 0.07
    },

    # === COMPLEMENTARY BUNDLES (real customer behavior) ===
    "complements": [
        ("Jinro Fresh Soju",                 ["Pepero", "Choco Pie", "Samyang Buldak"]),
        ("Chamisul Original Soju",           ["Pepero", "Honey Butter Almond", "Buldak"]),
        ("Yopokki Sweet & Spicy 280g",       ["Ottogi Cheese Bokki", "Bibigo Mandu"]),
        ("Bibigo Mul Mandu",                 ["Ottogi Jin Ramen", "Sempio Soy Sauce", "Kimchi"]),
        ("Beef Dasida",                      ["Ottogi Jin Ramen", "Nongshim Shin"]),
    ],
    "complement_chance": 0.42                # ↓ from 0.50 → less aggressive bundling
}

# ========================= LOAD PRODUCTS & POPULARITY =========================
base_dir = os.path.dirname(os.path.abspath(__file__))
products_path = os.path.join(base_dir, "Final Products List.xlsx")
products = pd.read_excel(products_path, sheet_name="Sheet1")
products.columns = ["Product_Name", "Unit_Price", "Category"]
products["Product_ID"] = [f"P{i:04d}" for i in range(1, len(products) + 1)]

# Top sellers — these will dominate 65-70% of sales (real power-law)
top_sellers = [
    "Chamisul Original Soju", "Jinro Fresh Soju", "Cass Cold Brewed Beer 500mL", "Terra Lager Beer 500mL",
    "Banana Milk 200mL 6Pcs", "Strawberry Milk 200mL 6Pcs", "Pepero Original", "Pepero Almond",
    "Honey Butter Almond 190g", "Wasabi Almond 190g", "Samyang Buldak", "Shin Ramyun", "Jin Ramen",
    "Yopokki Cheese", "Yopokki Sweet & Spicy", "Bibigo Mandu", "Choco Pie", "Ottogi Jin Ramen"
]

def get_popularity_weight(row):
    name = row["Product_Name"]
    if any(top in name for top in top_sellers):
        return random.uniform(50, 140)   # ↓ Slightly reduced top-seller dominance
    elif row["Unit_Price"] < 80:
        return random.uniform(10, 32)
    elif row["Unit_Price"] < 200:
        return random.uniform(4, 14)
    else:
        return random.uniform(0.7, 4.5)

products["Popularity_Weight"] = products.apply(get_popularity_weight, axis=1)
category_groups = {cat: group for cat, group in products.groupby("Category")}

# ========================= LOAD HOLIDAYS =========================
holidays_path = os.path.join(base_dir, "Holidays.xlsx")
holidays_df = pd.read_excel(holidays_path)
holidays_df["Date"] = pd.to_datetime(holidays_df["Date"]).dt.date
major_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "major"]["Date"])
regular_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "regular"]["Date"])

# ========================= HELPERS =========================
def get_peak_hour():
    r = random.random()
    if r < 0.30:       # Lunch peak
        return random.choices([11,12,13], weights=[0.25,0.45,0.30])[0]
    elif r < 0.62:     # Dinner peak
        return random.choices([17,18,19,20], weights=[0.15,0.30,0.35,0.20])[0]
    else:
        return random.randint(8, 21)

def add_complements(basket, all_products):
    for trigger, keywords in CONFIG["complements"]:
        if any(trigger in item["row"]["Product_Name"] for item in basket):
            if random.random() < CONFIG["complement_chance"]:
                candidates = all_products[
                    all_products["Product_Name"].str.contains("|".join(keywords), case=False, na=False)
                ]
                if not candidates.empty and len(basket) < CONFIG["max_items_per_tx"]:
                    comp = candidates.sample(1, weights=candidates["Popularity_Weight"]).iloc[0]
                    basket.append({"row": comp, "qty": 1})

# ========================= MAIN GENERATOR =========================
def generate_sales_data(config):
    year = config["year"]
    start = datetime(year, 1, 1)
    end = datetime(year, 12, 31)
    records = []
    transaction_id = 1

    current = start
    while current <= end:
        date = current.date()
        weekday = current.weekday()
        month = current.month

        # Multipliers
        growth_mult = config["monthly_growth"].get(month, 1.0)
        weekday_mult = config["weekday_multiplier"][weekday]

        if date in major_holidays:
            day_mult = config["major_holiday_boost"]
            discount_chance = config["discount_chance_holiday_major"]
        elif date in regular_holidays:
            day_mult = config["regular_holiday_drop"]
            discount_chance = 0.0
        else:
            day_mult = 1.0
            discount_chance = config["discount_chance_promo"] if month in config["promo_months"] else 0.0

        total_mult = growth_mult * weekday_mult * day_mult
        daily_tx = int(config["base_tx_per_day"] * total_mult * random.uniform(0.80, 1.20))
        daily_tx = max(60, daily_tx)   # Lower floor than before

        for _ in range(daily_tx):
            basket = []
            hour = get_peak_hour()
            time = current.replace(hour=hour, minute=random.randint(0,59), second=0, microsecond=0)

            # Build realistic mixed basket
            for category, prob in config["category_in_basket_prob"].items():
                if random.random() < prob:
                    group = category_groups[category]
                    n_items = random.randint(1, 3 if group["Unit_Price"].mean() < 180 else 1)
                    selected = group.sample(min(n_items, len(group)), replace=False, weights=group["Popularity_Weight"])
                    for _, row in selected.iterrows():
                        max_q = 1 if row["Unit_Price"] > 550 else (6 if row["Unit_Price"] < 90 else 3)
                        qty = random.randint(1, min(10, max_q))
                        basket.append({"row": row, "qty": qty})

            # Add realistic complements
            add_complements(basket, products)

            # Cap basket size
            if len(basket) > config["max_items_per_tx"]:
                basket = random.sample(basket, config["max_items_per_tx"])

            # Save each line
            for item in basket:
                row = item["row"]
                qty = item["qty"]
                discount = random.choice(config["discount_values"]) if random.random() < discount_chance else 0.0
                total = round(row["Unit_Price"] * qty * (1 - discount), 2)

                records.append({
                    "Transaction_Id": f"T{year}{transaction_id:06d}",
                    "Date": current.strftime("%Y-%m-%d"),
                    "Time": time.strftime("%H:%M:%S"),
                    "Product_ID": row["Product_ID"],
                    "Product_Name": row["Product_Name"],
                    "Category": row["Category"],
                    "Quantity": qty,
                    "Unit_Price": row["Unit_Price"],
                    "Discount": discount,
                    "Total_Amount": total
                })

            transaction_id += 1

        current += timedelta(days=1)

    return pd.DataFrame(records)

# ============================= RUN =============================
if __name__ == "__main__":
    os.makedirs(CONFIG["output_dir"], exist_ok=True)
    print(f"Generating full year {CONFIG['year']} sales data — LOWER REVENUE VERSION")

    df = generate_sales_data(CONFIG)
    output_file = os.path.join(CONFIG["output_dir"], f"Sales_Data_{CONFIG['year']}_LowerRevenue.csv")
    df.to_csv(output_file, index=False)

    print(f"\nDone! → {output_file}")
    print(f"   Transactions: {df['Transaction_Id'].nunique():,}")
    print(f"   Line items:   {len(df):,}")
    print(f"   Total Revenue: ₱{df['Total_Amount'].sum():,.0f}")
    print(f"   Avg daily revenue: ₱{df.groupby('Date')['Total_Amount'].sum().mean():,.0f}")