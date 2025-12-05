// controllers/dataController.js (FIXED WEEKLY vs TRAINING DETECTION)
const db = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const SalesFileValidator = require("../services/salesFileValidator");
const PythonService = require("../services/pythonService");

class DataController {
  async handleUpload(req, res) {
    console.log("\n" + "="*70);
    console.log("📤 NEW UPLOAD REQUEST");
    console.log("="*70);
    
    const startTime = Date.now();

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    const originalFile = req.file;
    let filePath = originalFile.path;
    let fileName = originalFile.originalname;
    let salesID = null;

    console.log(`📦 File: ${fileName}`);
    console.log(`👤 User: ${userId}`);

    try {
      // STEP 1: Convert Excel to CSV if needed
      if (fileName.endsWith(".xlsx")) {
        console.log("📘 Converting Excel to CSV...");
        try {
          const convertedPath = await PythonService.convertToCsv(filePath);
          if (!convertedPath || !fs.existsSync(convertedPath)) {
            throw new Error("Excel conversion failed");
          }
          filePath = convertedPath;
          fileName = path.basename(convertedPath);
          console.log("✅ Converted successfully");
        } catch (convertErr) {
          console.error("❌ Excel conversion error:", convertErr);
          throw new Error(`Excel conversion failed: ${convertErr.message}`);
        }
      } else if (!fileName.endsWith(".csv")) {
        throw new Error("Unsupported file type. Upload CSV or XLSX only.");
      }

      // STEP 2: Validate headers
      try {
        SalesFileValidator.validate(filePath, fileName);
      } catch (validateErr) {
        console.error("❌ File validation error:", validateErr.message);
        throw new Error(`File validation failed: ${validateErr.message}`);
      }

      // STEP 3: Count rows
      let rowCount;
      try {
        rowCount = await PythonService.countRows(filePath);
        if (!rowCount || rowCount === 0) {
          throw new Error("File appears to be empty or could not count rows");
        }
        console.log(`📊 Rows: ${rowCount.toLocaleString()}`);
      } catch (countErr) {
        console.error("❌ Row counting error:", countErr);
        throw new Error(`Row counting failed: ${countErr.message}`);
      }

      // STEP 4: Check if this user already uploaded the same file
      try {
        const checkSql = `SELECT salesID FROM salesdata WHERE userId = ? AND fileName = ?`;
        const existing = await new Promise((resolve, reject) => {
          db.query(checkSql, [userId, fileName], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });

        if (existing.length > 0) {
          throw new Error(`File "${fileName}" already exists for your account.`);
        }

        // Insert new record with "Uploaded" status (will be updated as processing progresses)
        const insertSql = `INSERT INTO salesdata (userId, fileName, records, status) VALUES (?, ?, ?, ?)`;
        const insertResult = await new Promise((resolve, reject) => {
          db.query(insertSql, [userId, fileName, rowCount, "Uploaded"], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
        salesID = insertResult.insertId;
        console.log(`✅ Database record created (ID: ${salesID})`);
      } catch (dbErr) {
        throw new Error(`Database error: ${dbErr.message}`);
      }

      // STEP 5: Move file to salesData folder
      const finalSalesDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
      if (!fs.existsSync(finalSalesDir)) fs.mkdirSync(finalSalesDir, { recursive: true });

      const finalFilePath = path.join(finalSalesDir, path.basename(filePath));
      if (filePath !== finalFilePath) {
        fs.renameSync(filePath, finalFilePath);
        console.log(`📂 Moved to: ${finalFilePath}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🎉 Upload complete for ${fileName}`);
      console.log(`📊 Total records: ${rowCount.toLocaleString()}`);
      console.log(`⏰ Processing time: ${duration}s`);
      console.log("="*70 + "\n");

      res.json({
        message: `File uploaded successfully (${rowCount.toLocaleString()} records)`,
        records: rowCount,
        salesID: salesID,
      });

      // STEP 6: CRITICAL DECISION - Is this training data or weekly data?
      const modelDir = path.resolve(__dirname, "../../ml-service/models", `user_${userId}`);
      const modelExists = this.checkProductModelsExist(modelDir);

      console.log("\n" + "="*70);
      console.log("🤔 UPLOAD TYPE DETECTION");
      console.log("="*70);
      console.log(`   Model exists: ${modelExists}`);
      console.log(`   Row count: ${rowCount}`);

      let isWeeklyUpload = false;

      // Logic: If models exist AND file is small (< 5000 rows), treat as weekly
      if (modelExists && rowCount < 5000) {
        isWeeklyUpload = true;
        console.log("✅ DETECTED: Weekly forecast upload");
        console.log("   Reason: Models exist + small file size");
      } else {
        console.log("✅ DETECTED: Training data upload");
        console.log("   Reason: No models yet OR large file");
      }
      console.log("="*70 + "\n");

      // STEP 7: Launch preprocessing
      this.updateUploadStatus(salesID, "Preprocessing")
        .catch(err => console.error("Failed to update status:", err));

      PythonService.preprocessData(userId, isWeeklyUpload)
        .then(async () => {
          console.log(`✅ Preprocessing completed for user ${userId}`);

          // If weekly upload → generate forecast immediately
          if (isWeeklyUpload) {
            console.log("\n📅 Weekly upload → Generating forecast...");
            try {
              await PythonService.generateForecast(userId);
              console.log("✅ Forecast generation complete!");
              this.updateUploadStatus(salesID, "Completed");
            } catch (forecastErr) {
              console.error(`⚠️ Forecast failed: ${forecastErr.message}`);
              this.updateUploadStatus(salesID, "Failed");
            }
            return;
          }

          // If training upload → check if we can train
          const cleanDir = path.resolve(__dirname, "../files/cleanData", `user_${userId}`);
          const processedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.includes("_processed") && f.endsWith(".xlsx"));

          const mergedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.startsWith("merged_3yr_sales") && f.endsWith(".xlsx"));

          console.log(`\n📂 Training files: ${processedFiles.length}`);
          console.log(`📂 Merged files: ${mergedFiles.length}`);

          // Train if we have 3+ years and no model yet
          if (processedFiles.length >= 3 && mergedFiles.length > 0 && !modelExists) {
            console.log(`🚀 Starting initial model training for user ${userId}...`);
            this.updateUploadStatus(salesID, "Training");
            
            try {
              await PythonService.trainModel(userId);
              console.log("🎯 Training completed!");
              console.log("✅ Models ready! Upload weekly sales to generate forecasts.");
              this.updateUploadStatus(salesID, "Completed");
            } catch (trainErr) {
              console.error(`⚠️ Training failed: ${trainErr.message}`);
              this.updateUploadStatus(salesID, "Failed");
            }
          } else {
            this.updateUploadStatus(salesID, "Completed");
          }
        })
        .catch((err) => {
          console.error(`⚠️ Preprocessing error: ${err.message}`);
          this.updateUploadStatus(salesID, "Failed");
        });

    } catch (err) {
      console.error("\n❌ UPLOAD FAILED:");
      console.error("   " + err.message);
      console.error("="*70 + "\n");
      return res.status(400).json({
        message: err.message || "Upload failed",
        error: process.env.NODE_ENV === "development" ? err.stack : undefined
      });
    }
  }

  async updateUploadStatus(salesID, status) {
    if (!salesID) {
      console.warn("⚠️ Cannot update status: salesID is null/undefined");
      return;
    }
  
    try {
      const sql = `UPDATE salesdata SET status = ? WHERE salesID = ?`;
      await new Promise((resolve, reject) => {
        db.query(sql, [status, salesID], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      console.log(`✅ Status updated: ${status}`);
    } catch (err) {
      console.error(`❌ Status update failed:`, err.message);
    }
  }

  checkProductModelsExist(modelDir) {
    try {
      if (!fs.existsSync(modelDir)) {
        console.log(`   ℹ️  Model directory doesn't exist: ${modelDir}`);
        return false;
      }

      const productDirs = fs.readdirSync(modelDir).filter((d) => {
        const fullPath = path.join(modelDir, d);
        return fs.statSync(fullPath).isDirectory() && d.startsWith("product_");
      });

      if (productDirs.length === 0) {
        console.log(`   ℹ️  No product model directories found in ${modelDir}`);
        return false;
      }

      const hasValidModels = productDirs.some((productDir) => {
        const productPath = path.join(modelDir, productDir);
        const lstmPath = path.join(productPath, "lstm_model.keras");
        const xgbPath = path.join(productPath, "xgb_model.json");
        return fs.existsSync(lstmPath) && fs.existsSync(xgbPath);
      });

      console.log(`   ✅ Found ${productDirs.length} product model directories`);
      console.log(`   ✅ Valid models: ${hasValidModels ? "Yes" : "No"}`);

      return hasValidModels;
    } catch (err) {
      return false;
    }
  }

async getUploads(req, res) {
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: User not logged in" });
  }

  const sql = "SELECT * FROM salesdata WHERE userId = ? ORDER BY uploadDate DESC";

  db.query(sql, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Log only when not polling
    const isPolling = req.query.polling === "true";
    if (!isPolling) {
      console.log(`📡 Fetching uploaded data records...`);
      console.log(`✅ Fetched ${results.length} upload records for user ${userId}`);
    }

    // Send response ONCE
    return res.json(results);
  });
}

  async deleteUpload(req, res) {
    const { id } = req.params;
    console.log(`🗑️ Deleting upload record ID: ${id}`);
    
    try {
      const [record] = await new Promise((resolve, reject) => {
        db.query("SELECT userId, fileName FROM salesdata WHERE salesID = ?", [id], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!record) {
        return res.status(404).json({ message: "Record not found" });
      }

      await new Promise((resolve, reject) => {
        db.query("DELETE FROM salesdata WHERE salesID = ?", [id], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Delete files
      const salesDir = path.join(__dirname, "../files/salesData", `user_${record.userId}`);
      const cleanDir = path.join(__dirname, "../files/cleanData", `user_${record.userId}`);
      const weeklyDir = path.join(__dirname, "../files/weeklyData", `user_${record.userId}`);

      [salesDir, cleanDir, weeklyDir].forEach(dir => {
        try {
          const filePath = path.join(dir, record.fileName);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn("Could not delete file:", e.message);
        }
      });

      res.json({ message: "Upload deleted successfully" });
    } catch (err) {
      return res.status(500).json({ message: "Deletion failed", error: err });
    }
  }

  async getPreprocessStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const status = PythonService.getPreprocessStatus(userId);
      return res.json(status);
    } catch (err) {
      console.error("❌ Status error:", err);
      return res.status(500).json({ message: "Failed to get status" });
    }
  }

  async getTrainingStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        console.error("❌ Status error:", err);
        return res.status(401).json({ message: "Unauthorized" });
      }

      const sql = `SELECT salesID, fileName, status, uploadDate 
                   FROM salesdata 
                   WHERE userId = ? 
                   ORDER BY uploadDate DESC 
                   LIMIT 1`;
      
      db.query(sql, [userId], (err, results) => {
        if (err) {
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (results.length === 0) {
          return res.json({ status: "idle", message: "No uploads found" });
        }

        const record = results[0];
        const statusMap = {
          "Uploaded": { status: "preprocessing", message: "Preparing data..." },
          "Preprocessing": { status: "preprocessing", message: "Processing data..." },
          "Training": { status: "training", message: "Training models..." },
          "Completed": { status: "completed", message: "Processing complete!" },
          "Failed": { status: "failed", message: "Processing failed" }
        };

        const response = statusMap[record.status] || {
          status: "unknown",
          message: record.status
        };

        return res.json({
          ...response,
          salesID: record.salesID,
          fileName: record.fileName,
          uploadDate: record.uploadDate
        });
      });
    } catch (err) {
      console.error("❌ Training status error:", err);
      return res.status(500).json({ message: "Failed to get training status" });
    }
  }

  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const sql = `SELECT salesID, status FROM salesdata WHERE userId = ? ORDER BY uploadDate DESC`;
      
      db.query(sql, [userId], (err, uploads) => {
        if (err) {
          return res.status(500).json({ message: "Database error", error: err });
        }
        
        const hasData = uploads.length > 0;
        const hasCompletedTraining = uploads.some(u => u.status === "Completed");
        const isProcessing = uploads.some(u => 
          u.status === "Preprocessing" || u.status === "Training"
        );
        
        res.json({
          hasData,
          hasCompletedTraining,
          isProcessing,
          totalUploads: uploads.length
        });
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check data status" });
    }
  }
}

module.exports = new DataController();