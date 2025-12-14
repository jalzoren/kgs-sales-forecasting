// controllers/dataController.js - SUPABASE/POSTGRES VERSION + RENDER ML SERVICE
const db = require("../config/db.js"); // ✅ This should be your Supabase/Postgres client
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

    if (!req.file) {
      console.log("❌ No file in request");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.session.user?.id;
    if (!userId) {
      console.log("❌ User not authenticated");
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    const originalFile = req.file;
    let filePath = originalFile.path;
    let fileName = originalFile.originalname;
    let salesID = null;

    console.log(`📦 File: ${fileName}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📂 Temp path: ${filePath}`);

    try {
      // STEP 1: Convert Excel to CSV if needed
      if (fileName.endsWith(".xlsx")) {
        console.log("\n📘 Excel file detected - converting to CSV...");
        try {
          const convertedPath = await PythonService.convertToCsv(filePath);
          console.log(`✅ Converted path: ${convertedPath}`);
          
          if (!convertedPath) {
            throw new Error("Excel conversion returned empty path");
          }
          
          filePath = convertedPath;
          fileName = path.basename(convertedPath);
          console.log(`✅ New filename: ${fileName}`);
        } catch (convertErr) {
          console.error("❌ Excel conversion error:", convertErr.message);
          throw new Error(`Excel conversion failed: ${convertErr.message}`);
        }
      } else if (!fileName.endsWith(".csv")) {
        throw new Error("Unsupported file type. Upload CSV or XLSX only.");
      }

      // STEP 2: Validate headers
      console.log("\n🔍 Validating file headers...");
      try {
        SalesFileValidator.validate(filePath, fileName);
        console.log("✅ File validation passed");
      } catch (validateErr) {
        console.error("❌ File validation error:", validateErr.message);
        throw new Error(`File validation failed: ${validateErr.message}`);
      }

      // STEP 3: Count rows
      console.log("\n📊 Counting rows...");
      let rowCount;
      try {
        rowCount = await PythonService.countRows(filePath);
        console.log(`   Raw count result: ${rowCount}`);
        
        if (!rowCount || rowCount === 0) {
          throw new Error("File appears to be empty or could not count rows");
        }
        console.log(`✅ Total rows: ${rowCount.toLocaleString()}`);
      } catch (countErr) {
        console.error("❌ Row counting error:", countErr.message);
        throw new Error(`Row counting failed: ${countErr.message}`);
      }

      // STEP 4: Check if this user already uploaded the same file
      console.log("\n🔍 Checking for duplicate filename...");
      try {
        // ✅ SUPABASE/POSTGRES: Use $1, $2 placeholders (NOT ?)
        const checkSql = `
          SELECT salesid
          FROM salesdata
          WHERE userid = $1 AND filename = $2
        `;

        const { rows: existing } = await db.query(checkSql, [userId, fileName]);

        if (existing.length > 0) {
          console.log(`⚠️  Duplicate found: ${fileName}`);
          throw new Error(`File "${fileName}" already exists for your account.`);
        }

        console.log("✅ No duplicate found");

        // ✅ SUPABASE/POSTGRES: Insert and return salesid
        console.log("\n💾 Creating database record...");
        const insertSql = `
          INSERT INTO salesdata (userid, filename, records, status)
          VALUES ($1, $2, $3, $4)
          RETURNING salesid
        `;

        const { rows } = await db.query(insertSql, [
          userId,
          fileName,
          rowCount,
          "Uploaded"
        ]);

        // ✅ Postgres returns lowercase: salesid
        salesID = rows[0].salesid;
        console.log(`✅ Database record created (salesID: ${salesID})`);
      } catch (dbErr) {
        console.error("❌ Database error:", dbErr.message);
        throw new Error(`Database error: ${dbErr.message}`);
      }

      // STEP 5: Move file to salesData folder
      console.log("\n📂 Moving file to permanent storage...");
      const finalSalesDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
      console.log(`   Target directory: ${finalSalesDir}`);
      
      if (!fs.existsSync(finalSalesDir)) {
        console.log("   Creating directory...");
        fs.mkdirSync(finalSalesDir, { recursive: true });
      }

      const finalFilePath = path.join(finalSalesDir, path.basename(filePath));
      console.log(`   Final path: ${finalFilePath}`);
      
      if (filePath !== finalFilePath) {
        if (fs.existsSync(filePath)) {
          fs.renameSync(filePath, finalFilePath);
          console.log(`✅ File moved successfully`);
        } else {
          console.warn(`⚠️  Source file not found: ${filePath}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n🎉 Upload complete!`);
      console.log(`   File: ${fileName}`);
      console.log(`   Records: ${rowCount.toLocaleString()}`);
      console.log(`   Time: ${duration}s`);
      console.log("=".repeat(70) + "\n");

      // Send immediate response to user
      res.json({
        message: `File uploaded successfully (${rowCount.toLocaleString()} records)`,
        records: rowCount,
        salesID: salesID,
      });

      // STEP 6: CRITICAL DECISION - Is this training data or weekly data?
      console.log("\n" + "=".repeat(70));
      console.log("🤔 UPLOAD TYPE DETECTION");
      console.log("=".repeat(70));
      
      // ✅ Check models via HTTP to Render ML service (NOT local filesystem)
      let modelExists = false;
      try {
        console.log("🔍 Checking if models exist via ML service...");
        modelExists = await PythonService.checkIfModelExists(userId);
        console.log(`   Model exists: ${modelExists}`);
      } catch (checkErr) {
        console.error("⚠️  Failed to check model existence:", checkErr.message);
        console.log("   Assuming no models exist");
        modelExists = false;
      }

      console.log(`   Row count: ${rowCount}`);

      let isWeeklyUpload = false;

      // Logic: If models exist AND file is small (< 5000 rows), treat as weekly
      if (modelExists && rowCount < 5000) {
        isWeeklyUpload = true;
        console.log("✅ DETECTED: Weekly forecast upload");
        console.log("   Reason: Models exist + small file size (< 5000 rows)");
      } else {
        console.log("✅ DETECTED: Training data upload");
        console.log("   Reason: " + (modelExists ? "Large file size" : "No models yet"));
      }
      console.log("=".repeat(70) + "\n");

      // STEP 7: Launch preprocessing (async - don't wait)
      console.log("🚀 Starting async preprocessing pipeline...");
      this.updateUploadStatus(salesID, "Preprocessing")
        .catch(err => console.error("⚠️  Failed to update status:", err));

      PythonService.preprocessData(userId, isWeeklyUpload)
        .then(async (preprocessResult) => {
          console.log(`\n✅ Preprocessing completed for user ${userId}`);
          console.log(`   Result: ${JSON.stringify(preprocessResult, null, 2)}`);

          // If weekly upload → run full weekly forecast pipeline
          if (isWeeklyUpload) {
            console.log("\n" + "=".repeat(70));
            console.log("📅 WEEKLY UPLOAD PIPELINE");
            console.log("=".repeat(70));
            console.log("Running full forecast pipeline...");
            
            const WeeklyForecastService = require("../services/weeklyForecastService");
            
            try {
              const pipelineResult = await WeeklyForecastService.processWeeklyUpload(userId, finalFilePath);
              
              if (pipelineResult && pipelineResult.success) {
                console.log("✅ Weekly pipeline completed successfully!");
                console.log(`   Metrics: ${JSON.stringify(pipelineResult.metrics, null, 2)}`);
                
                WeeklyForecastService.saveMetrics(userId, pipelineResult.metrics);
                await this.updateUploadStatus(salesID, "Completed");
              } else {
                console.error(`⚠️  Pipeline completed with warnings`);
                await this.updateUploadStatus(salesID, "Completed");
              }
            } catch (pipelineErr) {
              console.error(`❌ Weekly pipeline failed: ${pipelineErr.message}`);
              console.error(`   Stack: ${pipelineErr.stack}`);
              await this.updateUploadStatus(salesID, "Failed");
            }
            
            console.log("=".repeat(70) + "\n");
            return;
          }

          // If training upload → check if we can train
          console.log("\n" + "=".repeat(70));
          console.log("📊 TRAINING DATA PIPELINE");
          console.log("=".repeat(70));
          
          const cleanDir = path.resolve(__dirname, "../files/cleanData", `user_${userId}`);
          console.log(`   Clean data directory: ${cleanDir}`);
          
          if (!fs.existsSync(cleanDir)) {
            console.log("⚠️  Clean data directory doesn't exist yet");
            await this.updateUploadStatus(salesID, "Completed");
            console.log("=".repeat(70) + "\n");
            return;
          }

          const processedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.includes("_processed") && f.endsWith(".xlsx"));

          const mergedFiles = fs
            .readdirSync(cleanDir)
            .filter((f) => f.startsWith("merged_3yr_sales") && f.endsWith(".xlsx"));

          console.log(`\n📂 Found files in clean data:`);
          console.log(`   Processed files: ${processedFiles.length}`);
          console.log(`   Merged files: ${mergedFiles.length}`);
          console.log(`   Model exists: ${modelExists}`);

          // Train if we have 3+ years and no model yet
          if (processedFiles.length >= 3 && mergedFiles.length > 0 && !modelExists) {
            console.log(`\n🚀 Conditions met for initial training!`);
            console.log(`   Starting model training for user ${userId}...`);
            await this.updateUploadStatus(salesID, "Training");
            
            try {
              const trainResult = await PythonService.trainModel(userId);
              console.log("✅ Training completed successfully!");
              console.log(`   Result: ${JSON.stringify(trainResult, null, 2)}`);
              console.log("🎯 Models ready! Upload weekly sales to generate forecasts.");
              await this.updateUploadStatus(salesID, "Completed");
            } catch (trainErr) {
              console.error(`❌ Training failed: ${trainErr.message}`);
              console.error(`   Stack: ${trainErr.stack}`);
              await this.updateUploadStatus(salesID, "Failed");
            }
          } else {
            console.log(`\n⚠️  Training conditions not met:`);
            if (processedFiles.length < 3) {
              console.log(`   - Need 3+ processed files (have ${processedFiles.length})`);
            }
            if (mergedFiles.length === 0) {
              console.log(`   - Need merged file (have ${mergedFiles.length})`);
            }
            if (modelExists) {
              console.log(`   - Models already exist`);
            }
            await this.updateUploadStatus(salesID, "Completed");
          }
          
          console.log("=".repeat(70) + "\n");
        })
        .catch(async (err) => {
          console.error("\n❌ PREPROCESSING/PIPELINE FAILED");
          console.error("=".repeat(70));
          console.error(`   Error: ${err.message}`);
          console.error(`   Stack: ${err.stack}`);
          console.error("=".repeat(70) + "\n");
          await this.updateUploadStatus(salesID, "Failed");
        });

    } catch (err) {
      console.error("\n❌ UPLOAD FAILED");
      console.error("=".repeat(70));
      console.error(`   Error: ${err.message}`);
      if (process.env.NODE_ENV === "development") {
        console.error(`   Stack: ${err.stack}`);
      }
      console.error("=".repeat(70) + "\n");
      
      return res.status(400).json({
        message: err.message || "Upload failed",
        error: process.env.NODE_ENV === "development" ? err.stack : undefined
      });
    }
  }

  async updateUploadStatus(salesID, status) {
    if (!salesID) {
      console.warn("⚠️  Cannot update status: salesID is null/undefined");
      return;
    }
  
    try {
      console.log(`\n💾 Updating status for salesID ${salesID} → ${status}`);
      // ✅ SUPABASE/POSTGRES: Use $1, $2 placeholders
      const sql = `
        UPDATE salesdata
        SET status = $1
        WHERE salesid = $2
      `;

      await db.query(sql, [status, salesID]);
      console.log(`✅ Status updated successfully`);
    } catch (err) {
      console.error(`❌ Status update failed:`, err.message);
      throw err;
    }
  }

  async getUploads(req, res) {
    const userId = req.session.user?.id;
    if (!userId) {
      console.log("❌ Unauthorized access to getUploads");
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    try {
      const isPolling = req.query.polling === "true";
      if (!isPolling) {
        console.log(`\n📋 Fetching uploads for user ${userId}`);
      }
      
      // ✅ SUPABASE/POSTGRES: Use $1 placeholder
      const sql = `
        SELECT *
        FROM salesdata
        WHERE userid = $1
        ORDER BY uploaddate DESC
      `;

      const { rows } = await db.query(sql, [userId]);
      
      if (!isPolling) {
        console.log(`✅ Found ${rows.length} uploads`);
      }
      
      return res.json(rows);
    } catch (err) {
      console.error("❌ Failed to fetch uploads:", err.message);
      return res.status(500).json({ message: "Failed to fetch uploads", error: err.message });
    }
  }

  async deleteUpload(req, res) {
    const { id } = req.params;
    console.log(`\n🗑️  DELETE REQUEST - Upload ID: ${id}`);
    
    try {
      // ✅ SUPABASE/POSTGRES: Use $1 placeholder
      console.log("   Fetching record from database...");
      const { rows } = await db.query(
        "SELECT userid, filename FROM salesdata WHERE salesid = $1",
        [id]
      );

      const record = rows[0];

      if (!record) {
        console.log("   ❌ Record not found");
        return res.status(404).json({ message: "Record not found" });
      }

      console.log(`   Found: ${record.filename} (User: ${record.userid})`);

      // ✅ SUPABASE/POSTGRES: Use $1 placeholder
      console.log("   Deleting from database...");
      await db.query("DELETE FROM salesdata WHERE salesid = $1", [id]);
      console.log("   ✅ Database record deleted");

      // Delete files
      console.log("   Deleting associated files...");
      const salesDir = path.join(__dirname, "../files/salesData", `user_${record.userid}`);
      const cleanDir = path.join(__dirname, "../files/cleanData", `user_${record.userid}`);
      const weeklyDir = path.join(__dirname, "../files/weeklyData", `user_${record.userid}`);

      let deletedCount = 0;
      [salesDir, cleanDir, weeklyDir].forEach(dir => {
        try {
          const filePath = path.join(dir, record.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`   ✅ Deleted: ${filePath}`);
          }
        } catch (e) {
          console.warn(`   ⚠️  Could not delete file: ${e.message}`);
        }
      });

      console.log(`✅ Deletion complete (${deletedCount} files removed)\n`);
      res.json({ message: "Upload deleted successfully" });
    } catch (err) {
      console.error("❌ Deletion failed:", err.message);
      return res.status(500).json({ message: "Deletion failed", error: err.message });
    }
  }

  async getPreprocessStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        console.log("❌ Unauthorized access to getPreprocessStatus");
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      console.log(`\n📊 Fetching preprocess status for user ${userId}`);
      const status = PythonService.getPreprocessStatus(userId);
      return res.json(status);
    } catch (err) {
      console.error("❌ Status error:", err.message);
      return res.status(500).json({ message: "Failed to get status" });
    }
  }

  async getTrainingStatus(req, res) {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        console.log("❌ Unauthorized access to getTrainingStatus");
        return res.status(401).json({ message: "Unauthorized" });
      }

      console.log(`\n📊 Fetching training status for user ${userId}`);
      // ✅ SUPABASE/POSTGRES: Use $1 placeholder
      const sql = `
        SELECT salesid, filename, status, uploaddate
        FROM salesdata
        WHERE userid = $1
        ORDER BY uploaddate DESC
        LIMIT 1
      `;
      const { rows } = await db.query(sql, [userId]);

      if (rows.length === 0) {
        console.log("   No uploads found");
        return res.json({ status: "idle", message: "No uploads found" });
      }

      const record = rows[0];
      console.log(`   Latest upload: ${record.filename} (Status: ${record.status})`);
      
      const statusMap = {
        Uploaded: { status: "preprocessing", message: "Preparing data..." },
        Preprocessing: { status: "preprocessing", message: "Processing data..." },
        Training: { status: "training", message: "Training models..." },
        Completed: { status: "completed", message: "Processing complete!" },
        Failed: { status: "failed", message: "Processing failed" },
      };

      const response = statusMap[record.status] || {
        status: "unknown",
        message: record.status,
      };

      return res.json({
        ...response,
        salesID: record.salesid,
        fileName: record.filename,
        uploadDate: record.uploaddate,
      });
    } catch (err) {
      console.error("❌ Training status error:", err.message);
      return res.status(500).json({ message: "Failed to get training status" });
    }
  }

  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id;
    if (!userId) {
      console.log("❌ Unauthorized access to getUserDataStatus");
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      console.log(`\n📊 Fetching data status for user ${userId}`);
      // ✅ SUPABASE/POSTGRES: Use $1 placeholder
      const sql = `
        SELECT salesid, status
        FROM salesdata
        WHERE userid = $1
        ORDER BY uploaddate DESC
      `;
      
      const { rows: uploads } = await db.query(sql, [userId]);

      const hasData = uploads.length > 0;
      const hasCompletedTraining = uploads.some(u => u.status === "Completed");
      const isProcessing = uploads.some(u => ["Preprocessing", "Training"].includes(u.status));

      console.log(`   Total uploads: ${uploads.length}`);
      console.log(`   Has completed training: ${hasCompletedTraining}`);
      console.log(`   Is processing: ${isProcessing}`);

      res.json({
        hasData,
        hasCompletedTraining,
        isProcessing,
        totalUploads: uploads.length
      });
    } catch (error) {
      console.error("❌ Failed to check data status:", error.message);
      res.status(500).json({ message: "Failed to check data status", error: error.message });
    }
  }
}

module.exports = new DataController();