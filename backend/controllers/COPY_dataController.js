// controllers/dataController.js (FIXED MODEL DETECTION)
const db = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const SalesFileValidator = require("../services/salesFileValidator.js");
const PythonService = require("../services/pythonService.js");

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

    console.log(`📦 File uploaded: ${fileName}`);
    console.log(`📍 Path: ${filePath}`);
    console.log(`👤 Uploaded by User ID: ${userId}`);

    try {
      // STEP 1️⃣: Detect & Convert if Excel
      if (fileName.endsWith(".xlsx")) {
        console.log("📘 Detected Excel file — converting to CSV...");
        try {
          const convertedPath = await PythonService.convertToCsv(filePath);

          if (!convertedPath || !fs.existsSync(convertedPath)) {
            throw new Error("Conversion failed — cannot process Excel file");
          }

          filePath = convertedPath;
          fileName = path.basename(convertedPath);
          console.log("✅ Conversion successful, using converted CSV for next steps");
        } catch (convertErr) {
          console.error("❌ Excel conversion error:", convertErr);
          throw new Error(`Excel conversion failed: ${convertErr.message}`);
        }
      } else if (!fileName.endsWith(".csv")) {
        throw new Error("Unsupported file type. Please upload CSV or XLSX only.");
      }

      // STEP 2️⃣: Validate file headers
      try {
        SalesFileValidator.validate(filePath, fileName);
      } catch (validateErr) {
        console.error("❌ File validation error:", validateErr.message);
        throw new Error(`File validation failed: ${validateErr.message}`);
      }

      // STEP 3️⃣: Count rows
      let rowCount;
      try {
        rowCount = await PythonService.countRows(filePath);
        if (!rowCount || rowCount === 0) {
          throw new Error("File appears to be empty or could not count rows");
        }
        console.log(`📊 Row count: ${rowCount}`);
      } catch (countErr) {
        console.error("❌ Row counting error:", countErr);
        throw new Error(`Failed to count rows: ${countErr.message}`);
      }

      // STEP 4️⃣: Check if this user already uploaded the same file
      try {
        const checkSql = `SELECT salesID FROM salesdata WHERE userId = ? AND fileName = ?`;
        const existing = await new Promise((resolve, reject) => {
          db.query(checkSql, [userId, fileName], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });

        if (existing.length > 0) {
          throw new Error(`A file named "${fileName}" already exists for your account.`);
        }

        // Insert new record with "Uploaded" status (will be updated as processing progresses)
        const insertSql = `INSERT INTO salesdata (userId, fileName, records, status) VALUES (?, ?, ?, ?)`;
        const insertResult = await new Promise((resolve, reject) => {
          db.query(insertSql, [userId, fileName, rowCount, "Uploaded"], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
        salesID = insertResult.insertId;  // ✅ Now properly assigned
        console.log(`✅ Database record created with salesID: ${salesID}`);
      } catch (dbErr) {
        console.error("❌ Database error:", dbErr);
        throw new Error(`Database operation failed: ${dbErr.message}`);
      }

      // STEP 5️⃣: Move final file to salesData folder
      const finalSalesDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
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
        salesID: salesID,
      });

      // STEP 6️⃣: Launch preprocessing asynchronously
      // Update status to "Preprocessing"
      this.updateUploadStatus(salesID, "Preprocessing")
        .catch(err => console.error("Failed to update status to Preprocessing:", err));

      PythonService.preprocessData(userId)
        .then(async () => {
          console.log(`✅ Preprocessing completed for user ${userId}`);

          const cleanDir = path.resolve(__dirname, "../files/cleanData", `user_${userId}`);
          const processedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.includes("_processed") && f.endsWith(".xlsx"));

          const mergedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.startsWith("merged_3yr_sales") && f.endsWith(".xlsx"));

          const modelDir = path.resolve(__dirname, "../../ml-service/models", `user_${userId}`);
          
          // Check for product-level models
          const modelExists = this.checkProductModelsExist(modelDir);

          console.log(
            `📂 Processed files: ${processedFiles.length}, Merged files: ${mergedFiles.length}, Model exists: ${modelExists}`
          );

          // 🧩 Case 1: No model yet, but 3+ years available
          if (processedFiles.length >= 3 && mergedFiles.length > 0 && !modelExists) {
            console.log(`🚀 Starting initial model training for user ${userId}...`);
            // Update status to "Training"
            this.updateUploadStatus(salesID, "Training")
              .catch(err => console.error("Failed to update status to Training:", err));
            
            try {
              await PythonService.trainModel(userId);
              console.log(`🎯 Model training completed successfully for user ${userId}!`);

              // ✅ FIXED: Mark as completed WITHOUT generating forecast
              // User must upload weekly sales data to trigger forecast generation
              console.log(`✅ Models are ready! Upload weekly sales data to generate forecasts.`);
              
              // Update status to "Completed"
              this.updateUploadStatus(salesID, "Completed")
                .catch(err => console.error("Failed to update status to Completed:", err));
            } catch (trainErr) {
              console.error(`⚠️ Training failed for user ${userId}:`, trainErr.message);
              // Update status to "Failed"
              this.updateUploadStatus(salesID, "Failed")
                .catch(err => console.error("Failed to update status to Failed:", err));
            }
            return;
          }

          // 🧩 Case 2: Model already exists — use weekly upload for new forecast
          if (modelExists) {
            console.log(`📅 Weekly data upload detected — generating forecast using existing model...`);
            try {
              await PythonService.generateForecast(userId);
              console.log(`✅ Weekly forecast generation completed for user ${userId}!`);
              
              // Update status to "Completed"
              this.updateUploadStatus(salesID, "Completed")
                .catch(err => console.error("Failed to update status to Completed:", err));
            } catch (forecastErr) {
              console.error(`⚠️ Forecast generation failed for user ${userId}:`, forecastErr.message);
              // Update status to "Failed"
              this.updateUploadStatus(salesID, "Failed")
                .catch(err => console.error("Failed to update status to Failed:", err));
            }
            return;
          }

          // If no model training needed, just mark as completed
          this.updateUploadStatus(salesID, "Completed")
            .catch(err => console.error("Failed to update status to Completed:", err));

          console.log(`⚠️ No valid case matched for user ${userId}.`);
          console.log(`   Processed files: ${processedFiles.length}, Merged files: ${mergedFiles.length}, Model exists: ${modelExists}`);
        })
        .catch((err) => {
          console.error(`⚠️ Python preprocessing error: ${err.message}`);
          // Update status to "Failed"
          this.updateUploadStatus(salesID, "Failed")
            .catch(updateErr => console.error("Failed to update status to Failed:", updateErr));
        });
    } catch (err) {
      console.error("❌ Upload failed:", err.message);
      console.error("   Stack:", err.stack);
      return res.status(400).json({ 
        message: err.message || "Upload failed",
        error: process.env.NODE_ENV === "development" ? err.stack : undefined
      });
    }
  }

  /** ✅ NEW METHOD: Update upload status in database */
  async updateUploadStatus(salesID, status) {
    if (!salesID) {
      console.warn("⚠️ Cannot update status: salesID is null/undefined");
      return;
    }
    
    try {
      const sql = `UPDATE salesdata SET status = ? WHERE salesID = ?`;
      await new Promise((resolve, reject) => {
        db.query(sql, [status, salesID], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
      console.log(`✅ Updated salesID ${salesID} status to: ${status}`);
    } catch (err) {
      console.error(`❌ Failed to update status for salesID ${salesID}:`, err.message);
      throw err;
    }
  }

  /**
   * ✅ NEW METHOD: Check if product-level models exist
   * Returns true if at least one product model directory contains both LSTM and XGBoost models
   */
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

      // Check if at least one product has both models
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
      console.error(`   ❌ Error checking models: ${err.message}`);
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
        console.error("❌ Database fetch error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      
      // ✅ Only log if explicitly requested (not during polling)
      const isPolling = req.query.polling === "true";
      if (!isPolling) {
        console.log(`📡 Fetching uploaded data records...`);
        console.log(`✅ Fetched ${results.length} upload records for user ${userId}`);
      }
      
      res.json(results);
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

      const userId = record.userId;
      const fileName = record.fileName;

      await new Promise((resolve, reject) => {
        db.query("DELETE FROM salesdata WHERE salesID = ?", [id], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const salesDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
      const cleanDir = path.join(__dirname, "../files/cleanData", `user_${userId}`);

      const salesFilePath = path.join(salesDir, fileName);
      try {
        if (fs.existsSync(salesFilePath)) fs.unlinkSync(salesFilePath);
      } catch (e) {
        console.warn("⚠️ Could not delete salesData file:", salesFilePath, e.message);
      }

      const base = fileName.split(".")[0];
      try {
        if (fs.existsSync(cleanDir)) {
          const files = fs.readdirSync(cleanDir);
          files
            .filter((f) => f.startsWith(`${base}_processed_`))
            .forEach((f) => {
              try {
                fs.unlinkSync(path.join(cleanDir, f));
              } catch (e) {
                console.warn("⚠️ Could not delete cleanData file:", f, e.message);
              }
            });
        }
      } catch (e) {
        console.warn("⚠️ Error while deleting cleanData files:", e.message);
      }

      console.log("✅ Record and files deleted successfully!");
      res.json({ message: "Upload and related files deleted successfully" });
    } catch (err) {
      console.error("❌ Deletion error:", err);
      return res.status(500).json({ message: "Deletion failed", error: err });
    }
  }

  async getPreprocessStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User not logged in" });
      }
      const status = PythonService.getPreprocessStatus(userId);
      return res.json(status);
    } catch (err) {
      console.error("❌ Status error:", err);
      return res.status(500).json({ message: "Failed to get status" });
    }
  }

  /**
   * ✅ NEW METHOD: Get training status for frontend polling
   * Returns the status of the most recent upload for the user
   */
  async getTrainingStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User not logged in" });
      }

      // Get the most recent upload record
      const sql = `SELECT salesID, fileName, status, uploadDate 
                   FROM salesdata 
                   WHERE userId = ? 
                   ORDER BY uploadDate DESC 
                   LIMIT 1`;
      
      db.query(sql, [userId], (err, results) => {
        if (err) {
          console.error("❌ Training status fetch error:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (results.length === 0) {
          return res.json({
            status: "idle",
            message: "No uploads found"
          });
        }

        const record = results[0];
        
        // Map database status to frontend-friendly response
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
  

  // Add this method to DataController class (fix the SQL and logic)
  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id; // ✅ Fixed: was req.session.userId
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    try {
      const sql = `SELECT salesID, status FROM salesdata WHERE userId = ? ORDER BY uploadDate DESC`;
      
      db.query(sql, [userId], (err, uploads) => {
        if (err) {
          console.error("❌ getUserDataStatus error:", err);
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
      console.error("❌ Error checking user data status:", error);
      res.status(500).json({ message: "Failed to check data status" });
    }
  }
}

module.exports = new DataController();