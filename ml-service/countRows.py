# ml-service/countRows.py
import sys, os

def count_csv_fast(file_path):
    """Count CSV rows quickly using buffered iteration."""
    with open(file_path, "rb") as f:
        count = 0
        for line in f:
            count += 1
    print(max(count - 1, 0))  # minus header safely

def main():
    if len(sys.argv) < 2:
        print("ERROR: Missing file path")
        return

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print("ERROR: File not found")
        return

    if not file_path.endswith(".csv"):
        print("ERROR: Only CSV supported — XLSX should be converted first")
        return

    count_csv_fast(file_path)

if __name__ == "__main__":
    main()
