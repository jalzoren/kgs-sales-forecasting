// controllers/dataController.js (Supabase version)
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
        const { data: existing, error: checkError } = await db
          .from("salesdata")
          .select("salesID")
          .eq("userId", userId)
          .eq("fileName", fileName);

        if (checkError) throw checkError;

        if (existing.length > 0) {
          throw new Error(`File "${fileName}" already exists for your account.`);
        }

        // Insert new record with "Uploaded" status
        const { data: insertResult, error: insertError } = await db
          .from("salesdata")
          .insert([
            {
              userId,
              fileName,
              records: rowCount,
              status: "Uploaded",
              uploadDate: new Date().toISOString()
            }
          ])
          .select();

        if (insertError) throw insertError;
        salesID = insertResult[0].salesID;
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

      // STEP 6: Detect type (weekly vs training)
      const modelDir = path.resolve(__dirname, "../../ml-service/models", `user_${userId}`);
      const modelExists = this.checkProductModelsExist(modelDir);

      console.log("\n" + "=".repeat(70));
      console.log("🤔 UPLOAD TYPE DETECTION");
      console.log("=".repeat(70));
      console.log(`   Model exists: ${modelExists}`);
      console.log(`   Row count: ${rowCount}`);

      let isWeeklyUpload = false;
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
      this.updateUploadStatus(salesID, "Preprocessing").catch(err => console.error("Failed to update status:", err));

      PythonService.preprocessData(userId, isWeeklyUpload)
        .then(async () => {
          console.log(`✅ Preprocessing completed for user ${userId}`);

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

          const cleanDir = path.resolve(__dirname, "../files/cleanData", `user_${userId}`);
          const processedFiles = fs
            .readdirSync(cleanDir)
            .filter(f => f.includes("_processed") && f.endsWith(".xlsx"));

          const mergedFiles = fs
            .readdirSync(cleanDir)
            .filter(f => f.startsWith("merged_3yr_sales") && f.endsWith(".xlsx"));

          console.log(`\n📂 Training files: ${processedFiles.length}`);
          console.log(`📂 Merged files: ${mergedFiles.length}`);

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
        .catch(err => {
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
    if (!salesID) return console.warn("⚠️ Cannot update status: salesID is null/undefined");
  
    try {
      const { error } = await db
        .from("salesdata")
        .update({ status })
        .eq("salesID", salesID);
      if (error) throw error;
      console.log(`✅ Status updated: ${status}`);
    } catch (err) {
      console.error(`❌ Status update failed:`, err.message);
    }
  }

  checkProductModelsExist(modelDir) {
    try {
      if (!fs.existsSync(modelDir)) return false;
      const productDirs = fs.readdirSync(modelDir).filter(d => {
        const fullPath = path.join(modelDir, d);
        return fs.statSync(fullPath).isDirectory() && d.startsWith("product_");
      });
      if (productDirs.length === 0) return false;
      return productDirs.some(pd => fs.existsSync(path.join(modelDir, pd, "lstm_model.keras")) &&
                                   fs.existsSync(path.join(modelDir, pd, "xgb_model.json")));
    } catch {
      return false;
    }
  }

  async getUploads(req, res) {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized: User not logged in" });

    try {
      const { data: results, error } = await db
        .from("salesdata")
        .select("*")
        .eq("userId", userId)
        .order("uploadDate", { ascending: false });

      if (error) throw error;

      const isPolling = req.query.polling === "true";
      if (!isPolling) console.log(`📡 Fetched ${results.length} upload records for user ${userId}`);

      res.json(results);
    } catch (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }
  }

  async deleteUpload(req, res) {
    const { id } = req.params;
    console.log(`🗑️ Deleting upload record ID: ${id}`);

    try {
      const { data: records, error: selectError } = await db
        .from("salesdata")
        .select("userId, fileName")
        .eq("salesID", id);

      if (selectError) throw selectError;
      const record = records[0];
      if (!record) return res.status(404).json({ message: "Record not found" });

      const { error: deleteError } = await db
        .from("salesdata")
        .delete()
        .eq("salesID", id);

      if (deleteError) throw deleteError;

      const dirs = ["salesData", "cleanData", "weeklyData"];
      dirs.forEach(dirName => {
        try {
          const filePath = path.join(__dirname, "../files", dirName, `user_${record.userId}`, record.fileName);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
      });

      res.json({ message: "Upload deleted successfully" });
    } catch (err) {
      return res.status(500).json({ message: "Deletion failed", error: err });
    }
  }

  async getPreprocessStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

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
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { data: results, error } = await db
        .from("salesdata")
        .select("salesID, fileName, status, uploadDate")
        .eq("userId", userId)
        .order("uploadDate", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (!results || results.length === 0) return res.json({ status: "idle", message: "No uploads found" });

      const record = results[0];
      const statusMap = {
        "Uploaded": { status: "preprocessing", message: "Preparing data..." },
        "Preprocessing": { status: "preprocessing", message: "Processing data..." },
        "Training": { status: "training", message: "Training models..." },
        "Completed": { status: "completed", message: "Processing complete!" },
        "Failed": { status: "failed", message: "Processing failed" }
      };

      const response = statusMap[record.status] || { status: "unknown", message: record.status };
      return res.json({ ...response, salesID: record.salesID, fileName: record.fileName, uploadDate: record.uploadDate });
    } catch (err) {
      console.error("❌ Training status error:", err);
      return res.status(500).json({ message: "Failed to get training status" });
    }
  }

  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    try {
      const { data: uploads, error } = await db
        .from("salesdata")
        .select("salesID, status")
        .eq("userId", userId)
        .order("uploadDate", { ascending: false });

      if (error) throw error;

      const hasData = uploads.length > 0;
      const hasCompletedTraining = uploads.some(u => u.status === "Completed");
      const isProcessing = uploads.some(u => ["Preprocessing", "Training"].includes(u.status));

      res.json({ hasData, hasCompletedTraining, isProcessing, totalUploads: uploads.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to check data status" });
    }
  }
}

module.exports = new DataController();
