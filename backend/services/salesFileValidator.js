// services/salesFileValidator.js
const fs = require("fs");

class SalesFileValidator {
  constructor() {
    this.requiredColumns = [
      "date",
      "product_id",
      "product_name",
      "quantity",
      "total_amount",
    ];
  }

  validateHeaders(headers) {
    return this.requiredColumns.every((col) => headers.includes(col));
  }

  validate(filePath, fileName) {
    const ext = fileName.toLowerCase();
    if (!ext.endsWith(".csv")) {
      throw new Error("Validation only supports CSV files after conversion.");
    }

    const headerLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
    const headers = headerLine
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));

    if (!this.validateHeaders(headers)) {
      console.error("❌ CSV Header Validation Failed!");
      console.error("Headers found:", headers);
      console.error("Expected at least:", this.requiredColumns);
      throw new Error("Invalid CSV: Missing required columns");
    }

    console.log("✅ CSV headers validated successfully:", headers);
  }
}

module.exports = new SalesFileValidator();
