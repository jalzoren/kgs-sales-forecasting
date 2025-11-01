# ml-service/convertToCsv.py
import sys
import os
import pandas as pd

def convert_excel_to_csv(file_path):
    if not os.path.exists(file_path):
        print("ERROR: File not found")
        return ""

    csv_path = file_path.replace(".xlsx", ".csv")

    try:
        workbook = pd.ExcelFile(file_path, engine="openpyxl")
        sheet_count = len(workbook.sheet_names)

        if sheet_count > 1:
            print("ERROR: Excel file contains multiple sheets. Please upload a single-sheet file.")
            return ""

        # Read with dtype preservation (avoid NaN → empty string conversion)
        df = pd.read_excel(workbook, sheet_name=0, dtype=str)
        df = df.fillna("")  # preserve blanks exactly as-is
        df.to_csv(csv_path, index=False, encoding="utf-8-sig", quoting=1)
        print(csv_path)
    except Exception as e:
        print(f"ERROR: {e}")
        return ""

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("ERROR: Missing file path")
    else:
        convert_excel_to_csv(sys.argv[1])
