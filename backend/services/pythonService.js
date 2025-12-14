// services/pythonService.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");

class PythonService {
  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
    this.preprocessStatusByUserId = new Map();
    
    console.log("═══════════════════════════════════════════════════");
    console.log("🚀 PYTHON SERVICE INITIALIZED (HTTP MODE)");
    console.log("═══════════════════════════════════════════════════");
    console.log(`🌐 ML Service URL: ${this.mlServiceUrl}`);
    console.log(`📝 Mode: Remote HTTP calls (no local Python)`);
    console.log("═══════════════════════════════════════════════════\n");
  }

  // =====================================================
  // ✅ Preprocess status getter
  // =====================================================
  getPreprocessStatus(userId) {
    console.log(`\n📊 [GET STATUS] User: ${userId}`);
    const status = this.preprocessStatusByUserId.get(String(userId)) || {
      state: "idle",
      progress: 0,
      message: "No preprocessing started yet.",
    };
    console.log(`   Status: ${JSON.stringify(status, null, 2)}`);
    return status;
  }

  // =====================================================
  // ✅ Generate Forecast (HTTP request to ML service)
  // =====================================================
  async generateForecast(userId, horizonDays = null) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║          GENERATE FORECAST REQUEST                ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`📈 User ID: ${userId}`);
    console.log(`⏱️  Horizon Days: ${horizonDays || 'ALL (7d, 30d, 90d)'}`);
    console.log(`🌐 Target URL: ${this.mlServiceUrl}/api/forecast`);
    
    if (horizonDays) {
      console.log(`⚠️  Note: horizonDays parameter is ignored - ML service generates all horizons by default`);
    }

    let resultPath = null;

    try {
      console.log("\n📤 Sending HTTP POST request...");
      const payload = { user_id: userId.toString() };
      console.log(`   Payload: ${JSON.stringify(payload, null, 2)}`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${this.mlServiceUrl}/api/forecast`,
        payload,
        { timeout: 120000 } // 2 minute timeout
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      resultPath = response.data.forecast_path;
      console.log(`\n📂 Forecast Path: ${resultPath}`);

      // Auto-generate PDF after Excel is created
      if (resultPath) {
        console.log("\n┌─────────────────────────────────────────────────┐");
        console.log("│     AUTO-GENERATING PDF REPORT                  │");
        console.log("└─────────────────────────────────────────────────┘");
        
        try {
          const PDFService = require("./pdfService");
          
          // The ML service returns a path relative to its own structure
          // We need to construct the absolute path in our backend
          const fileName = path.basename(resultPath);
          console.log(`   File name: ${fileName}`);
          
          const filesDir = path.join(__dirname, "../files");
          const excelDir = path.join(filesDir, "forecastData", `user_${userId}`);
          const absoluteExcelPath = path.join(excelDir, fileName);
          
          console.log(`\n🔍 Looking for Excel file...`);
          console.log(`   Expected path: ${absoluteExcelPath}`);
          console.log(`   Files dir: ${filesDir}`);
          console.log(`   Excel dir: ${excelDir}`);
          
          // Ensure the Excel file exists locally
          if (!fs.existsSync(absoluteExcelPath)) {
            console.warn(`\n⚠️  Excel file not found locally!`);
            console.warn(`   Path checked: ${absoluteExcelPath}`);
            console.warn(`   This is normal if files are stored only on ML service.`);
            console.warn(`   Skipping PDF generation.`);
            return resultPath;
          }
          
          console.log(`✅ Excel file found!`);
          const excelStats = fs.statSync(absoluteExcelPath);
          console.log(`   Size: ${(excelStats.size / 1024).toFixed(2)} KB`);
          
          const pdfFileName = fileName.replace(".xlsx", ".pdf");
          const pdfDir = path.join(filesDir, "forecastPdf", `user_${userId}`);
          const pdfPath = path.join(pdfDir, pdfFileName);
          
          console.log(`\n📁 PDF Output Configuration:`);
          console.log(`   PDF Directory: ${pdfDir}`);
          console.log(`   PDF Filename: ${pdfFileName}`);
          console.log(`   Full PDF Path: ${pdfPath}`);
          
          // Ensure PDF directory exists
          if (!fs.existsSync(pdfDir)) {
            console.log(`\n📂 Creating PDF directory...`);
            fs.mkdirSync(pdfDir, { recursive: true });
            console.log(`✅ PDF directory created: ${pdfDir}`);
          } else {
            console.log(`✅ PDF directory already exists`);
          }
          
          console.log(`\n📄 Generating PDF report...`);
          console.log(`   Source (Excel): ${absoluteExcelPath}`);
          console.log(`   Target (PDF): ${pdfPath}`);
          
          const pdfStartTime = Date.now();
          await PDFService.generateForecastReport(absoluteExcelPath, pdfPath);
          const pdfElapsed = ((Date.now() - pdfStartTime) / 1000).toFixed(2);
          
          // Verify PDF was created
          if (fs.existsSync(pdfPath)) {
            const pdfStats = fs.statSync(pdfPath);
            console.log(`\n✅ PDF report generated successfully in ${pdfElapsed}s!`);
            console.log(`   Path: ${pdfPath}`);
            console.log(`   Size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
          } else {
            console.error(`\n❌ PDF file was not created at: ${pdfPath}`);
          }
        } catch (pdfErr) {
          console.error("\n❌ PDF GENERATION FAILED (forecast still successful)");
          console.error(`   Error: ${pdfErr.message}`);
          console.error(`   Stack: ${pdfErr.stack}`);
          // Don't fail the forecast if PDF generation fails
        }
      } else {
        console.warn("\n⚠️  No forecast path returned from ML service");
      }
      
      console.log("\n✅ Forecast generation completed successfully");
      console.log("═══════════════════════════════════════════════════\n");
      
    } catch (err) {
      console.error("\n❌ FORECAST GENERATION FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      throw new Error(`Forecast generation failed: ${this._formatError(err)}`);
    }

    return resultPath;
  }

  // =====================================================
  // ✅ Evaluate Forecast against weekly actuals
  // =====================================================
  async evaluateForecast(userId) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║           EVALUATE FORECAST REQUEST               ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`📊 User ID: ${userId}`);
    
    try {
      const evaluateUrl = `${this.mlServiceUrl}/api/evaluate`;
      console.log(`🌐 Target URL: ${evaluateUrl}`);
      
      const payload = { user_id: userId.toString() };
      console.log(`📤 Payload: ${JSON.stringify(payload, null, 2)}`);
      
      console.log(`\n⏳ Sending HTTP POST request...`);
      const startTime = Date.now();
      
      const response = await axios.post(evaluateUrl, payload, {
        timeout: 60000  // 60 second timeout
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      console.log("\n✅ Evaluation completed successfully");
      console.log("═══════════════════════════════════════════════════\n");

      return response.data;
    } catch (err) {
      console.error("\n❌ EVALUATION FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      
      const errorMsg = this._formatError(err);
      throw new Error(`Evaluation failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Check if model exists (HTTP request to ML service)
  // =====================================================
  async checkIfModelExists(userId) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║          CHECK MODEL EXISTS REQUEST                ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`🔍 User ID: ${userId}`);
    
    try {
      const url = `${this.mlServiceUrl}/api/model-exists`;
      console.log(`🌐 Target URL: ${url}`);
      console.log(`📤 Params: { user_id: "${userId}" }`);
      
      const startTime = Date.now();
      const response = await axios.get(url, {
        params: { user_id: userId.toString() },
        timeout: 10000
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      const exists = response.data.exists;
      console.log(`\n${exists ? '✅' : '❌'} Model exists: ${exists}`);
      console.log("═══════════════════════════════════════════════════\n");
      
      return exists;
    } catch (err) {
      console.error("\n❌ CHECK MODEL EXISTS FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      return false;
    }
  }

  // =====================================================
  // ✅ Preprocess Data (HTTP request to ML service)
  // =====================================================
  async preprocessData(userId, isWeekly = false) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║           PREPROCESS DATA REQUEST                 ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`🔄 User ID: ${userId}`);
    console.log(`📋 Type: ${isWeekly ? '📅 WEEKLY DATA' : '📊 TRAINING DATA'}`);
    console.log(`🌐 Target URL: ${this.mlServiceUrl}/api/preprocess`);
    
    this.preprocessStatusByUserId.set(String(userId), {
      state: "running",
      progress: 0,
      message: "Starting data preprocessing...",
    });
    console.log(`   Status set: RUNNING`);

    try {
      const payload = {
        user_id: userId.toString(),
        is_weekly: isWeekly,
      };
      console.log(`\n📤 Payload: ${JSON.stringify(payload, null, 2)}`);
      console.log(`⏳ Sending HTTP POST request (timeout: 120s)...`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${this.mlServiceUrl}/api/preprocess`,
        payload,
        { timeout: 120000 } // 2 minute timeout
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      this.preprocessStatusByUserId.set(String(userId), {
        state: "done",
        progress: 100,
        message: "Preprocessing completed successfully!",
      });
      console.log(`   Status set: DONE`);
      
      console.log("\n✅ Preprocessing completed successfully");
      console.log("═══════════════════════════════════════════════════\n");
      
      return response.data;
    } catch (err) {
      console.error("\n❌ PREPROCESSING FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      
      const errorMsg = this._formatError(err);
      this.preprocessStatusByUserId.set(String(userId), {
        state: "error",
        progress: 0,
        message: `Preprocessing failed: ${errorMsg}`,
      });
      console.log(`   Status set: ERROR`);
      console.error("═══════════════════════════════════════════════════\n");
      
      throw new Error(`Preprocessing failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Train Model (HTTP request to ML service)
  // =====================================================
  async trainModel(userId) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║            TRAIN MODEL REQUEST                    ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`🎯 User ID: ${userId}`);
    console.log(`🌐 Target URL: ${this.mlServiceUrl}/api/train`);

    try {
      const payload = { user_id: userId.toString() };
      console.log(`\n📤 Payload: ${JSON.stringify(payload, null, 2)}`);
      console.log(`⏳ Sending HTTP POST request (timeout: 300s)...`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${this.mlServiceUrl}/api/train`,
        payload,
        { timeout: 300000 } // 5 minute timeout
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      console.log("\n✅ Model training completed successfully");
      console.log("═══════════════════════════════════════════════════\n");

      return response.data;
    } catch (err) {
      console.error("\n❌ MODEL TRAINING FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      
      const errorMsg = this._formatError(err);
      throw new Error(`Model training failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Convert Excel to CSV (HTTP request to ML service)
  // =====================================================
  async convertToCsv(excelPath) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║          CONVERT EXCEL TO CSV REQUEST            ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`📊 Excel Path: ${excelPath}`);
    console.log(`🌐 Target URL: ${this.mlServiceUrl}/api/convert-to-csv`);
    
    try {
      const payload = { file_path: excelPath };
      console.log(`\n📤 Payload: ${JSON.stringify(payload, null, 2)}`);
      console.log(`⏳ Sending HTTP POST request...`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${this.mlServiceUrl}/api/convert-to-csv`,
        payload,
        { timeout: 30000 }
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);
      
      const csvPath = response.data.csv_path;
      console.log(`\n📂 CSV Path: ${csvPath}`);
      console.log("✅ Conversion completed successfully");
      console.log("═══════════════════════════════════════════════════\n");

      return csvPath;
    } catch (err) {
      console.error("\n❌ EXCEL TO CSV CONVERSION FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      
      const errorMsg = this._formatError(err);
      throw new Error(`Conversion failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Count rows in CSV or Excel file (HTTP request)
  // =====================================================
  async countRows(filePath) {
    console.log("\n╔═══════════════════════════════════════════════════╗");
    console.log("║            COUNT ROWS REQUEST                     ║");
    console.log("╚═══════════════════════════════════════════════════╝");
    console.log(`📊 File Path: ${filePath}`);
    console.log(`🌐 Target URL: ${this.mlServiceUrl}/api/count-rows`);
    
    try {
      const payload = { file_path: filePath };
      console.log(`\n📤 Payload: ${JSON.stringify(payload, null, 2)}`);
      console.log(`⏳ Sending HTTP POST request...`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${this.mlServiceUrl}/api/count-rows`,
        payload,
        { timeout: 30000 }
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n✅ HTTP Response received in ${elapsed}s`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Data: ${JSON.stringify(response.data, null, 2)}`);

      const count = response.data.row_count || 0;
      console.log(`\n📊 Row count: ${count}`);
      console.log("✅ Count completed successfully");
      console.log("═══════════════════════════════════════════════════\n");
      
      return count;
    } catch (err) {
      console.error("\n❌ COUNT ROWS FAILED");
      console.error("═══════════════════════════════════════════════════");
      this._logError(err);
      console.error("═══════════════════════════════════════════════════\n");
      return 0;
    }
  }

  // =====================================================
  // 🔧 Helper: Format error messages
  // =====================================================
  _formatError(err) {
    if (err.response) {
      // Server responded with error
      const rd = err.response.data;
      const errorMsg = rd?.detail || rd?.message || rd || err.response.statusText || "Server error";
      return typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
    } else if (err.request) {
      // Request made but no response
      return `No response from ML service at ${this.mlServiceUrl} - is it running?`;
    } else {
      // Error in request setup
      return err.message || "Unknown error";
    }
  }

  // =====================================================
  // 🔧 Helper: Log detailed error information
  // =====================================================
  _logError(err) {
    console.error(`🔴 Error Type: ${err.name || 'Unknown'}`);
    console.error(`🔴 Error Message: ${err.message}`);
    
    if (err.response) {
      console.error(`\n📡 HTTP Response Error:`);
      console.error(`   Status: ${err.response.status} ${err.response.statusText}`);
      console.error(`   Headers: ${JSON.stringify(err.response.headers, null, 2)}`);
      console.error(`   Data: ${JSON.stringify(err.response.data, null, 2)}`);
    } else if (err.request) {
      console.error(`\n📡 No Response Received:`);
      console.error(`   ML Service URL: ${this.mlServiceUrl}`);
      console.error(`   Request: ${JSON.stringify({
        method: err.config?.method,
        url: err.config?.url,
        timeout: err.config?.timeout
      }, null, 2)}`);
      console.error(`\n❗ Possible causes:`);
      console.error(`   1. ML service is not running`);
      console.error(`   2. ML service URL is incorrect`);
      console.error(`   3. Network connectivity issues`);
      console.error(`   4. Firewall blocking the connection`);
    } else {
      console.error(`\n⚠️  Request Setup Error:`);
      console.error(`   ${err.message}`);
    }
    
    if (err.stack) {
      console.error(`\n📚 Stack Trace:`);
      console.error(err.stack);
    }
  }
}

module.exports = new PythonService();