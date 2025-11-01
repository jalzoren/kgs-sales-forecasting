// controllers/dataController.js
const db = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const SalesFileValidator = require("../services/salesFileValidator");
const PythonService = require("../services/pythonService");

class DataController {
  async handleUpload(req, res) {
    console.log("📤 Received upload request...");
    const startTime = Date.now();

    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const originalFile = req.file;
    let filePath = originalFile.path;
    let fileName = originalFile.originalname;

    console.log(`📦 File uploaded: ${fileName}`);
    console.log(`📍 Path: ${filePath}`);

    try {
      // STEP 1️⃣: Detect & Convert if Excel
      if (fileName.endsWith(".xlsx")) {
        console.log("📘 Detected Excel file — converting to CSV...");
        const convertedPath = await PythonService.convertToCsv(filePath);

        // Ensure conversion succeeded
        if (!convertedPath || !fs.existsSync(convertedPath)) {
          throw new Error("Conversion failed — cannot process Excel file");
        }

        console.log("✅ Conversion successful, using converted CSV for next steps");
        filePath = convertedPath; // continue with CSV version
        fileName = path.basename(convertedPath);
      } else if (!fileName.endsWith(".csv")) {
        throw new Error("Unsupported file type. Please upload CSV or XLSX only.");
      }

      // STEP 2️⃣: Validate file headers
      SalesFileValidator.validate(filePath, fileName);

      // STEP 3️⃣: Count rows
      const rowCount = await PythonService.countRows(filePath);

      // STEP 4️⃣: Save record in DB
      const insertSql =
        "INSERT INTO salesdata (fileName, records, status) VALUES (?, ?, ?)";
      await db.query(insertSql, [fileName, rowCount, "Completed"]);

      // STEP 5️⃣: Move final file to salesData folder (if converted)
      const finalSalesDir = path.join(__dirname, "../files/salesData");
      if (!fs.existsSync(finalSalesDir)) fs.mkdirSync(finalSalesDir, { recursive: true });
      const finalFilePath = path.join(finalSalesDir, path.basename(filePath));

      if (filePath !== finalFilePath) {
        fs.renameSync(filePath, finalFilePath);
        console.log(`📂 File moved to: ${finalFilePath}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🎉 Upload complete for ${fileName}`);
      console.log(`📊 Total records: ${rowCount.toLocaleString()}`);
      console.log(`⏰ Processing time: ${duration}s`);

      res.json({
        message: `File uploaded successfully (${rowCount.toLocaleString()} records)`,
        records: rowCount,
      });

      // STEP 6️⃣: Launch preprocessing asynchronously
      await PythonService.preprocessData();
    } catch (err) {
      console.error("❌ Upload failed:", err.message);
      return res.status(400).json({ message: err.message });
    }
  }

  async getUploads(req, res) {
    console.log("📡 Fetching uploaded data records...");
    const sql = "SELECT * FROM salesdata ORDER BY uploadDate DESC";
    db.query(sql, (err, results) => {
      if (err) {
        console.error("❌ Database fetch error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      console.log(`✅ Fetched ${results.length} upload records`);
      res.json(results);
    });
  }

  async deleteUpload(req, res) {
    const { id } = req.params;
    console.log(`🗑️ Deleting upload record ID: ${id}`);
    const sql = "DELETE FROM salesdata WHERE salesID = ?";
    db.query(sql, [id], (err) => {
      if (err) {
        console.error("❌ Deletion error:", err);
        return res.status(500).json({ message: "Deletion failed", error: err });
      }
      console.log("✅ Record deleted successfully!");
      res.json({ message: "Upload deleted successfully" });
    });
  }
}

module.exports = new DataController();
