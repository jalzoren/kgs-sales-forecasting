# sales data week generator 
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# ============================= CONFIGURATION =============================
CONFIG = {
    "start_date": "2025-12-1",          # Monday
    "min_quantity": 1,
    "max_quantity": 5,

    # Realistic daily transactions for a medium-sized Korean mart in PH
    "base_tx_per_day": 100,              # Lowered to ~145 tx/day average → realistic for 300 products
    "tx_variation": 0.10,                # Tighter variation for stability

    "min_items_per_tx": 1,
    "max_items_per_tx": 5,               # Lowered max basket → 1-5 items (real for small stores)

    "open_hour": 8,
    "close_hour": 22,
    "output_dir": "sales_data",

    # Promo & discount (very realistic now)
    "promo_months": [1, 6, 11, 12],
    "discount_chance_promo_month": 0.12,      # 12% of items get discount in Nov/Dec
    "discount_chance_holiday_major": 0.18,    # Slightly higher on Christmas etc.
    "discount_values": [0.05, 0.10, 0.15],    # Only 5–15% off (real promo)

    # Weekday traffic pattern (Saturday peak, Monday low)
    "weekday_multiplier": {
        0: 0.82,   # Mon
        1: 0.92,   # Tue
        2: 0.98,   # Wed
        3: 1.05,   # Thu
        4: 1.18,   # Fri
        5: 1.32,   # Sat ← highest
        6: 1.08    # Sun
    },

    # Holiday effects
    "major_holiday_boost": 1.55,   # Christmas, New Year, etc.
    "regular_holiday_drop": 0.65,

    # === NEW: REALISTIC CATEGORY APPEARANCE PROBABILITY (per basket) ===
# Lower category probabilities (especially expensive ones)
    "category_in_basket_prob": {
            "Liquor/Beverage":          0.62,   # Most common
            "Snacks":                   0.68,   # Very common
            "Noodles":                  0.55,
            "Dry Food":                 0.28,
            "Condiments":               0.18,
            "Seasoned/Sauce/Powder":    0.15,
            "Food Frozen":              0.12,   # Rare in small baskets
            "Food Fresh/Meat/Sidedish": 0.06    # Very rare (expensive!)
        },

    # === NEW: COMPLEMENTARY PAIRS (very common real combos) ===
    "complements": [
        ("Jinro Fresh Soju",                 ["Pepero", "Choco Pie", "Samyang Buldak"]),
        ("Chamisul Original Soju",      ["Pepero", "Honey Butter Almond", "Buldak"]),
        ("Yopokki Sweet & Spicy 280g",       ["Ottogi Cheese Bokki", "Bibigo Mandu"]),
        ("Bibigo Mul Mandu",                 ["Ottogi Jin Ramen", "Sempio Soy Sauce"]),
        ("Beef Dasida",                      ["Ottogi Jin Ramen", "Nongshim Shin"]),
    ],
    "complement_chance": 0.45  # ← Added: only 45% chance to add complement (was 68%)
}

# ========================= LOAD PRODUCTS & ADD POPULARITY =========================
base_dir = os.path.dirname(os.path.abspath(__file__))
products_path = os.path.join(base_dir, "Final Products List.xlsx")
products = pd.read_excel(products_path, sheet_name="Sheet1")
products.columns = ["Product_Name", "Unit_Price", "Category"]
products["Product_ID"] = [f"P{i:04d}" for i in range(1, len(products) + 1)]

# === ADD REALISTIC POPULARITY WEIGHT (power-law distribution) ===
# Top sellers get massive weight, long tail very low
top_sellers = [
    "Chamisul Original Soju", "Jinro Fresh Soju", "Cass Cold Brewed Beer 500mL", "Terra Lager Beer 500mL",
    "Banana Milk 200mL 6Pcs", "Samyang Buldak Original", "Pepero Original", "Pepero Almond",
    "Honey Butter Almond 190g", "Shin Ramyun", "Ottogi Jin Ramen Hot", "Bibigo Mandu", "Yopokki Cheese 240g"
]

def get_popularity_weight(row):
    name = row["Product_Name"]
    if any(top in name for top in top_sellers):
        return random.uniform(25, 100)   # Top sellers
    elif row["Unit_Price"] < 80:
        return random.uniform(8, 25)     # Cheap impulse items
    elif row["Unit_Price"] < 200:
        return random.uniform(3, 12)
    else:
        return random.uniform(0.8, 4)    # Expensive meat = rare

products["Popularity_Weight"] = products.apply(get_popularity_weight, axis=1)

# Pre-group for speed
category_groups = {cat: group for cat, group in products.groupby("Category")}

# ========================= LOAD HOLIDAYS =========================
holidays_path = os.path.join(base_dir, "Holidays.xlsx")
holidays_df = pd.read_excel(holidays_path)
holidays_df["Date"] = pd.to_datetime(holidays_df["Date"]).dt.date
major_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "major"]["Date"])
regular_holidays = set(holidays_df[holidays_df["Type"].str.lower() == "regular"]["Date"])

# ========================= HELPER FUNCTIONS =========================
def get_hour_with_peak():
    """Realistic bimodal distribution: lunch 11-13 & dinner 17-20"""
    roll = random.random()
    if roll < 0.28:      # 28% lunch peak
        return random.choices([11,12,13], weights=[0.3,0.4,0.3])[0]
    elif roll < 0.58:    # 30% dinner peak
        return random.choices([17,18,19,20], weights=[0.2,0.3,0.35,0.15])[0]
    else:
        return random.randint(8, 21)   # off-peak hours


def maybe_add_complement(basket_items, products_df):
    """If a trigger item is bought, high chance to add complement"""
    # FIXED: basket_items now contain dict with "row", so we check row["Product_Name"]
    for trigger, complements in CONFIG["complements"]:
        if any(trigger in item["row"]["Product_Name"] for item in basket_items):
            if random.random() < CONFIG.get("complement_chance", 0.68):  # ← use lower chance
                pattern = "|".join(complements)
                candidates = products_df[products_df["Product_Name"].str.contains(pattern, case=False, na=False)]
                if not candidates.empty and len(basket_items) < 4:  # prevent overflow
                    comp_item = candidates.sample(1, weights=candidates["Popularity_Weight"]).iloc[0]
                    basket_items.append({"row": comp_item, "qty": 1})

# ========================= MAIN GENERATOR =========================
def generate_sales_data_1week(config):
    start_date = datetime.strptime(config["start_date"], "%Y-%m-%d")
    end_date = start_date + timedelta(days=6)
    records = []
    transaction_id = 1

    current = start_date
    while current <= end_date:
        date = current.date()
        weekday = current.weekday()
        month = current.month

        # Traffic multipliers
        mult = config["weekday_multiplier"][weekday]
        if date in major_holidays:
            mult *= config["major_holiday_boost"]
            discount_chance = config["discount_chance_holiday_major"]
        elif date in regular_holidays:
            mult *= config["regular_holiday_drop"]
            discount_chance = 0.0
        else:
            discount_chance = config["discount_chance_promo_month"] if month in config["promo_months"] else 0.0

        # Daily transactions with realistic variation
        daily_tx = int(config["base_tx_per_day"] * mult * random.uniform(1 - config["tx_variation"], 1 + config["tx_variation"]))
        daily_tx = max(50, daily_tx)

        for _ in range(daily_tx):
            basket = []
            time_hour = get_hour_with_peak()
            time = datetime(current.year, current.month, current.day, time_hour, random.randint(0,59))

            # === Decide which categories appear in this basket ===
            for category, base_prob in config["category_in_basket_prob"].items():
                if random.random() < base_prob:
                    group = category_groups[category]
                    # Pick 1–3 items from this category (more if cheap)
                    items_in_cat = random.randint(1, 3 if group["Unit_Price"].mean() < 150 else 1)
                    selected = group.sample(items_in_cat, replace=False, weights=group["Popularity_Weight"])
                    
                    # FIXED: Iterate through the selected rows and add to basket
                    for _, row in selected.iterrows():
                        # Quantity logic based on price
                        if row["Unit_Price"] > 400:
                            max_qty = 1
                        elif row["Unit_Price"] > 250:
                            max_qty = 1 if random.random() < 0.7 else 2
                        elif row["Unit_Price"] > 120:
                            max_qty = 2
                        elif row["Unit_Price"] > 70:
                            max_qty = 3
                        else:
                            max_qty = 5
                        
                        qty = random.randint(1, max_qty)
                        basket.append({"row": row, "qty": qty})

            # Add complements
            maybe_add_complement(basket, products)

            # Final basket size cap
            if len(basket) > config["max_items_per_tx"]:
                basket = random.sample(basket, config["max_items_per_tx"])

            # Record each line item
            for item in basket:
                row = item["row"]
                qty = item["qty"]
                discount = 0.0
                if random.random() < discount_chance:
                    discount = random.choice(config["discount_values"])

                total = round(row["Unit_Price"] * qty * (1 - discount), 2)

                records.append({
                    "Transaction_Id": f"T{current.year}{transaction_id:06d}",
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


# ============================== RUN ==============================
if __name__ == "__main__":
    os.makedirs(CONFIG["output_dir"], exist_ok=True)
    print(f"Generating realistic 1-week sales data starting {CONFIG['start_date']}...")

    df = generate_sales_data_1week(CONFIG)
    output_file = os.path.join(CONFIG["output_dir"], f"Sales_Data_Week_{CONFIG['start_date']}.csv")
    df.to_csv(output_file, index=False)

    print(f"✅ Done → {output_file}")
    print(f"   Total transactions: {df['Transaction_Id'].nunique():,}")
    print(f"   Total line items:   {len(df):,}")
    print(f"   Revenue:            ₱{df['Total_Amount'].sum():,.0f}")