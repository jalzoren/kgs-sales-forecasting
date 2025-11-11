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

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const userId = req.session.user?.id; // ✅ Get logged-in user's ID
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not logged in" });
    }

    const originalFile = req.file;
    let filePath = originalFile.path;
    let fileName = originalFile.originalname;

    console.log(`📦 File uploaded: ${fileName}`);
    console.log(`📍 Path: ${filePath}`);
    console.log(`👤 Uploaded by User ID: ${userId}`);

    try {
      // STEP 1️⃣: Detect & Convert if Excel
      if (fileName.endsWith(".xlsx")) {
        console.log("📘 Detected Excel file — converting to CSV...");
        const convertedPath = await PythonService.convertToCsv(filePath);

        // Ensure conversion succeeded
        if (!convertedPath || !fs.existsSync(convertedPath)) {
          throw new Error("Conversion failed — cannot process Excel file");
        }

        filePath = convertedPath; // continue with CSV version
        fileName = path.basename(convertedPath);
        console.log(
          "✅ Conversion successful, using converted CSV for next steps"
        );
      } else if (!fileName.endsWith(".csv")) {
        throw new Error(
          "Unsupported file type. Please upload CSV or XLSX only."
        );
      }

      // STEP 2️⃣: Validate file headers
      SalesFileValidator.validate(filePath, fileName);

      // STEP 3️⃣: Count rows
      const rowCount = await PythonService.countRows(filePath);

      // STEP 4️⃣: Check if this user already uploaded the same file
      const checkSql = `
  SELECT salesID FROM salesdata WHERE userId = ? AND fileName = ?
`;

      const existing = await new Promise((resolve, reject) => {
        db.query(checkSql, [userId, fileName], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (existing.length > 0) {
        throw new Error(
          `A file named "${fileName}" already exists for your account.`
        );
      }

      // Now safely insert the new record
      const insertSql = `
  INSERT INTO salesdata (userId, fileName, records, status)
  VALUES (?, ?, ?, ?)
`;
      await db.query(insertSql, [userId, fileName, rowCount, "Completed"]);

      // STEP 5️⃣: Move final file to salesData folder (if converted)
      const finalSalesDir = path.join(
        __dirname,
        "../files/salesData",
        `user_${userId}`
      );
      if (!fs.existsSync(finalSalesDir))
        fs.mkdirSync(finalSalesDir, { recursive: true });

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
      PythonService.preprocessData(userId)
        .then(async () => {
          console.log(`✅ Preprocessing completed for user ${userId}`);

          // STEP 7️⃣: Trigger training pipeline automatically
          console.log(`🚀 Starting model training for user ${userId}...`);
          try {
            await PythonService.trainModel(userId);
            console.log(
              `🎯 Model training completed successfully for user ${userId}!`
            );
          } catch (trainErr) {
            console.error(
              `⚠️ Training failed for user ${userId}:`,
              trainErr.message
            );
          }
        })
        .catch((err) =>
          console.error(`⚠️ Python preprocessing error: ${err.message}`)
        );
        
    } catch (err) {
      console.error("❌ Upload failed:", err.message);
      return res.status(400).json({ message: err.message });
    }
  }

  async getUploads(req, res) {
    console.log("📡 Fetching uploaded data records...");
    const userId = req.session.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not logged in" });
    }

    const sql =
      "SELECT * FROM salesdata WHERE userId = ? ORDER BY uploadDate DESC";
    db.query(sql, [userId], (err, results) => {
      if (err) {
        console.error("❌ Database fetch error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      console.log(
        `✅ Fetched ${results.length} upload records for user ${userId}`
      );
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
