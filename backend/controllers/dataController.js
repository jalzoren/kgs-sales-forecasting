// backend/controllers/dataController.js
const db = require("../config/db");
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
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    let filePath = req.file.path;
    let fileName = req.file.originalname;
    let salesID = null;

    console.log(`📦 File: ${fileName}`);
    console.log(`👤 User: ${userId}`);

    try {
      /* ----------------------------------------------------
       * STEP 1: Convert Excel → CSV
       * -------------------------------------------------- */
      if (fileName.endsWith(".xlsx")) {
        console.log("📘 Converting Excel to CSV...");
        const convertedPath = await PythonService.convertToCsv(filePath);
        if (!convertedPath || !fs.existsSync(convertedPath)) {
          throw new Error("Excel conversion failed");
        }
        filePath = convertedPath;
        fileName = path.basename(convertedPath);
      } else if (!fileName.endsWith(".csv")) {
        throw new Error("Unsupported file type. Upload CSV or XLSX only.");
      }

      /* ----------------------------------------------------
       * STEP 2: Validate headers
       * -------------------------------------------------- */
      SalesFileValidator.validate(filePath, fileName);

      /* ----------------------------------------------------
       * STEP 3: Count rows
       * -------------------------------------------------- */
      const rowCount = await PythonService.countRows(filePath);
      if (!rowCount || rowCount === 0) {
        throw new Error("File is empty");
      }
      console.log(`📊 Rows: ${rowCount}`);

      /* ----------------------------------------------------
       * STEP 4: Prevent duplicate uploads
       * -------------------------------------------------- */
      const duplicateCheck = await db.query(
        `SELECT salesid FROM salesdata WHERE userid = $1 AND filename = $2`,
        [userId, fileName]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new Error(`File "${fileName}" already exists for your account.`);
      }

      /* ----------------------------------------------------
       * STEP 5: Insert DB record
       * -------------------------------------------------- */
      const insertResult = await db.query(
        `INSERT INTO salesdata (userid, filename, records, status)
         VALUES ($1, $2, $3, $4)
         RETURNING salesid`,
        [userId, fileName, rowCount, "Uploaded"]
      );

      salesID = insertResult.rows[0].salesid;
      console.log(`✅ DB record created (salesID=${salesID})`);

      /* ----------------------------------------------------
       * STEP 6: Move file to final location
       * -------------------------------------------------- */
      const finalDir = path.join(
        __dirname,
        "../files/salesData",
        `user_${userId}`
      );
      fs.mkdirSync(finalDir, { recursive: true });

      const finalFilePath = path.join(finalDir, path.basename(filePath));
      if (filePath !== finalFilePath) {
        fs.renameSync(filePath, finalFilePath);
      }

      res.json({
        message: `File uploaded successfully (${rowCount} records)`,
        records: rowCount,
        salesID
      });

      /* ----------------------------------------------------
       * STEP 7: Weekly vs Training Detection (using ML service)
       * -------------------------------------------------- */
      const modelExists = await PythonService.checkIfModelExists(userId);

      const isWeeklyUpload = modelExists && rowCount < 5000;

      console.log(
        isWeeklyUpload
          ? "📅 WEEKLY UPLOAD detected"
          : "📚 TRAINING DATA detected"
      );

      await this.updateUploadStatus(salesID, "Preprocessing");

      /* ----------------------------------------------------
       * STEP 8: Preprocessing (sends file to ML service)
       * -------------------------------------------------- */
      await PythonService.preprocessData(userId, isWeeklyUpload);

      if (isWeeklyUpload) {
        const WeeklyForecastService = require("../services/weeklyForecastService");
        await WeeklyForecastService.processWeeklyUpload(
          userId,
          finalFilePath
        );
        await this.updateUploadStatus(salesID, "Completed");
        return;
      }

      /* ----------------------------------------------------
       * STEP 9: Training (check if enough data exists)
       * -------------------------------------------------- */
      const cleanDir = path.resolve(
        __dirname,
        "../files/cleanData",
        `user_${userId}`
      );

      const processedFiles = fs.existsSync(cleanDir)
        ? fs.readdirSync(cleanDir).filter(f => f.includes("_processed"))
        : [];

      // Only train if we have 3+ files and no existing model
      if (processedFiles.length >= 3 && !modelExists) {
        await this.updateUploadStatus(salesID, "Training");
        await PythonService.trainModel(userId);
      }

      await this.updateUploadStatus(salesID, "Completed");
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Upload completed in ${elapsed}s`);
      
    } catch (err) {
      console.error("❌ UPLOAD FAILED:", err.message);
      if (salesID) {
        await this.updateUploadStatus(salesID, "Failed");
      }
      return res.status(400).json({ message: err.message });
    }
  }

  /* ----------------------------------------------------
   * STATUS UPDATE (POSTGRES)
   * -------------------------------------------------- */
  async updateUploadStatus(salesID, status) {
    if (!salesID) return;
    await db.query(
      `UPDATE salesdata SET status = $1 WHERE salesid = $2`,
      [status, salesID]
    );
    console.log(`🔄 Status → ${status}`);
  }

  /* ----------------------------------------------------
   * FETCH UPLOADS
   * -------------------------------------------------- */
  async getUploads(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const result = await db.query(
        `SELECT * FROM salesdata
        WHERE userid = $1
        ORDER BY uploaddate DESC`,
        [userId]
      );

      // ✅ ALWAYS return an array (even if empty)
      // 404 is NOT appropriate here - empty data is a valid state
      if (result.rows.length === 0) {
        console.log(`ℹ️ No uploads found for user ${userId} (new user)`);
        return res.json([]); // ✅ Return empty array, not 404
      }

      console.log(`✅ Found ${result.rows.length} upload(s) for user ${userId}`);
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Error fetching uploads:", err);
      res.status(500).json({ 
        message: "Failed to fetch uploads",
        error: err.message 
      });
    }
  }

  /* ----------------------------------------------------
   * DELETE UPLOAD
   * -------------------------------------------------- */
  async deleteUpload(req, res) {
    const { id } = req.params;

    await db.query(
      `DELETE FROM salesdata WHERE salesid = $1`,
      [id]
    );

    res.json({ message: "Upload deleted successfully" });
  }

  /* ----------------------------------------------------
  * GET USER DATA STATUS (for Welcome page)
  * -------------------------------------------------- */
  async getUserDataStatus(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Check if user has any uploads
      const uploadsResult = await db.query(
        `SELECT COUNT(*) as count, 
                MAX(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as has_completed
        FROM salesdata 
        WHERE userid = $1`,
        [userId]
      );

      const dataCount = parseInt(uploadsResult.rows[0]?.count || 0);
      const hasModels = uploadsResult.rows[0]?.has_completed === 1;

      res.json({
        hasData: dataCount > 0,
        dataCount: dataCount,
        hasModels: hasModels
      });
    } catch (err) {
      console.error("❌ Error checking user data status:", err);
      res.status(500).json({ 
        message: "Failed to check data status",
        error: err.message 
      });
    }
  }

  /* ----------------------------------------------------
  * GET PREPROCESSING STATUS
  * -------------------------------------------------- */
  async getPreprocessStatus(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const PythonService = require("../services/pythonService");
      const status = PythonService.getPreprocessStatus(userId);
      res.json(status);
    } catch (err) {
      console.error("❌ Error getting preprocess status:", err);
      res.json({ 
        state: "idle", 
        progress: 0, 
        message: "No preprocessing in progress" 
      });
    }
  }

  /* ----------------------------------------------------
  * GET TRAINING STATUS
  * -------------------------------------------------- */
  async getTrainingStatus(req, res) {
    const userId = req.session.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Check if there's an ongoing training by checking latest upload status
      const result = await db.query(
        `SELECT status FROM salesdata 
        WHERE userid = $1 
        ORDER BY uploaddate DESC 
        LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({ 
          state: "idle", 
          progress: 0, 
          message: "No training in progress" 
        });
      }

      const status = result.rows[0].status;

      if (status === "Training") {
        return res.json({
          state: "running",
          progress: 50, // Generic progress since we don't track exact progress
          message: "Training models..."
        });
      } else if (status === "Completed") {
        return res.json({
          state: "done",
          progress: 100,
          message: "Training completed"
        });
      } else if (status === "Failed") {
        return res.json({
          state: "error",
          progress: 0,
          message: "Training failed"
        });
      } else {
        return res.json({
          state: "idle",
          progress: 0,
          message: "No training in progress"
        });
      }
    } catch (err) {
      console.error("❌ Error getting training status:", err);
      res.json({ 
        state: "idle", 
        progress: 0, 
        message: "No training in progress" 
      });
    }
  }
}



module.exports = new DataController();