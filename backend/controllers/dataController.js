// controllers/dataController.js (FIXED WEEKLY vs TRAINING DETECTION - SUPABASE)
const db = require("../config/db.js");
const fs = require("fs");
const path = require("path");
const SalesFileValidator = require("../services/salesFileValidator");
const PythonService = require("../services/pythonService");

class DataController {
  async handleUpload(req, res) {
    console.log("\n" + "=".repeat(70));
    console.log("📤 NEW UPLOAD REQUEST");
    console.log("=".repeat(70));
    
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
        const existing = await db.query("salesdata", {
          params: {
            userid: `eq.${userId}`,
            filename: `eq.${fileName}`,
            select: "salesid"
          },
        });

        if (existing && existing.length > 0) {
          throw new Error(`File "${fileName}" already exists for your account.`);
        }

        // Insert new record with "Uploaded" status (will be updated as processing progresses)
        const newRecord = await db.query("salesdata", {
          method: "POST",
          data: {
            userid: userId,
            filename: fileName,
            records: rowCount,
            status: "Uploaded",
          },
        });

        if (!newRecord || newRecord.length === 0) {
          throw new Error("Failed to create database record");
        }

        salesID = newRecord[0].salesid;
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
      console.log("=".repeat(70) + "\n");

      res.json({
        message: `File uploaded successfully (${rowCount.toLocaleString()} records)`,
        records: rowCount,
        salesID: salesID,
      });

      // STEP 6: CRITICAL DECISION - Is this training data or weekly data?
      const modelDir = path.resolve(__dirname, "../../ml-service/models", `user_${userId}`);
      const modelExists = this.checkProductModelsExist(modelDir);

      console.log("\n" + "=".repeat(70));
      console.log("🤔 UPLOAD TYPE DETECTION");
      console.log("=".repeat(70));
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
      console.log("=".repeat(70) + "\n");

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
      console.error("=".repeat(70) + "\n");
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
      const result = await db.query("salesdata", {
        method: "PATCH",
        params: { salesid: `eq.${salesID}` },
        data: { status: status },
      });

      if (!result || result.length === 0) {
        console.warn(`⚠️ No record updated for salesID: ${salesID}`);
        return;
      }

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

    try {
      const results = await db.query("salesdata", {
        params: {
          userid: `eq.${userId}`,
          order: "uploaddate.desc",
        },
      });

      // Log only when not polling
      const isPolling = req.query.polling === "true";
      if (!isPolling) {
        console.log(`📡 Fetching uploaded data records...`);
        console.log(`✅ Fetched ${results.length} upload records for user ${userId}`);
      }

      // Send response
      return res.json(results || []);
    } catch (err) {
      console.error("❌ Get uploads error:", err);
      return res.status(500).json({ message: "Database error", error: err.message });
    }
  }

  async deleteUpload(req, res) {
    const { id } = req.params;
    console.log(`🗑️ Deleting upload record ID: ${id}`);
    
    try {
      // Get the record first
      const records = await db.query("salesdata", {
        params: {
          salesid: `eq.${id}`,
          select: "userid,filename"
        },
      });

      if (!records || records.length === 0) {
        return res.status(404).json({ message: "Record not found" });
      }

      const record = records[0];

      // Delete the record
      await db.query("salesdata", {
        method: "DELETE",
        params: { salesid: `eq.${id}` },
      });

      // Delete files
      const salesDir = path.join(__dirname, "../files/salesData", `user_${record.userid}`);
      const cleanDir = path.join(__dirname, "../files/cleanData", `user_${record.userid}`);
      const weeklyDir = path.join(__dirname, "../files/weeklyData", `user_${record.userid}`);

      [salesDir, cleanDir, weeklyDir].forEach(dir => {
        try {
          const filePath = path.join(dir, record.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn("Could not delete file:", e.message);
        }
      });

      res.json({ message: "Upload deleted successfully" });
    } catch (err) {
      console.error("❌ Delete upload error:", err);
      return res.status(500).json({ message: "Deletion failed", error: err.message });
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
        return res.status(401).json({ message: "Unauthorized" });
      }

      const results = await db.query("salesdata", {
        params: {
          userid: `eq.${userId}`,
          select: "salesid,filename,status,uploaddate",
          order: "uploaddate.desc",
          limit: 1
        },
      });

      if (!results || results.length === 0) {
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
        salesID: record.salesid,
        fileName: record.filename,
        uploadDate: record.uploaddate
      });
    } catch (err) {
      console.error("❌ Training status error:", err);
      return res.status(500).json({ message: "Failed to get training status", error: err.message });
    }
  }

  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const uploads = await db.query("salesdata", {
        params: {
          userid: `eq.${userId}`,
          select: "salesid,status",
          order: "uploaddate.desc"
        },
      });

      const hasData = uploads && uploads.length > 0;
      const hasCompletedTraining = uploads ? uploads.some(u => u.status === "Completed") : false;
      const isProcessing = uploads ? uploads.some(u => 
        u.status === "Preprocessing" || u.status === "Training"
      ) : false;
      
      res.json({
        hasData,
        hasCompletedTraining,
        isProcessing,
        totalUploads: uploads ? uploads.length : 0
      });
    } catch (error) {
      console.error("❌ Get user data status error:", error);
      res.status(500).json({ message: "Failed to check data status", error: error.message });
    }
  }
}

module.exports = new DataController();