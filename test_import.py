#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "ml-service"))

from processData import parse_dates_safely
import pandas as pd

# Test date parsing
df = pd.DataFrame({
    'Date': ['03/11/2025', '04/11/2025', '05/11/2025', '06/11/2025']
})

print("Input dates:")
print(df)
print()

result = parse_dates_safely(df)

print("\nParsed result:")
print(result)
print()

# Expected: 2025-11-03 to 2025-11-06 (November 3-6, 2025)
print(f"Date range: {result['Date'].min()} to {result['Date'].max()}")
print(f"Expected: 2025-11-03 to 2025-11-06")

