// services/pythonService.js
const axios = require("axios");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");

class PythonService {
  constructor() {
    this.isProduction = process.env.NODE_ENV === "production" || process.env.USE_ML_SERVICE === "true";
    
    // ✅ ML Service URL (for production/remote)
    this.mlServiceUrl = process.env.ML_SERVICE_URL || "https://kgs-sales-forecasting-ml-service.onrender.com";
    
    // ✅ Local Python path (for local development)
    this.pythonPath = process.env.PYTHON_PATH || "D:/kgs-sales-forecasting/ml-service/venv/Scripts/python.exe";
    
    // Preprocess status tracking
    this.preprocessStatusByUserId = new Map();
    
    console.log("🔧 PythonService initialized:");
    console.log(`   Environment: ${this.isProduction ? "PRODUCTION (ML Service)" : "LOCAL (Python Scripts)"}`);
    if (this.isProduction) {
      console.log(`   ML Service URL: ${this.mlServiceUrl}`);
    } else {
      console.log(`   Python Path: ${this.pythonPath}`);
    }
  }

  // =====================================================
  // ✅ HYBRID: Run Python script locally OR call ML service
  // =====================================================
  async runScript(scriptPath, args = [], options = {}) {
    if (this.isProduction) {
      throw new Error("runScript() is not available in production mode. Use ML Service endpoints.");
    }
    
    return new Promise((resolve, reject) => {
      console.log(`🐍 Using Python at: ${this.pythonPath}`);
      console.log(`➡️ Running: ${scriptPath} ${args.join(" ")}`);

      const python = spawn(this.pythonPath, [scriptPath, ...args], {
        cwd: options.cwd || path.dirname(scriptPath),
      });

      let output = "";
      let errorMsg = "";

      python.stdout.on("data", (data) => {
        const msg = data.toString();
        output += msg;
        console.log("🧩 Python STDOUT:", msg);
      });

      python.stderr.on("data", (data) => {
        const msg = data.toString();
        errorMsg += msg;
        console.error("🐍 Python STDERR:", msg);
      });

      python.on("close", (code) => {
        if (code === 0 && !errorMsg.toLowerCase().includes("error")) {
          resolve(output.trim());
        } else {
          reject(new Error(`Python exited with code ${code}. Error:\n${errorMsg || "Unknown"}`));
        }
      });
    });
  }

  // =====================================================
  // ✅ Get Preprocess Status
  // =====================================================
  getPreprocessStatus(userId) {
    return (
      this.preprocessStatusByUserId.get(String(userId)) || {
        state: "idle",
        progress: 0,
        message: "No preprocessing started yet.",
      }
    );
  }

  // =====================================================
  // ✅ HYBRID: Generate Forecast
  // =====================================================
  async generateForecast(userId, horizonDays = null) {
    console.log(`📈 Generating forecast for User ID: ${userId}...`);
    
    if (this.isProduction) {
      // PRODUCTION: Call ML Service API
      return this._generateForecastRemote(userId);
    } else {
      // LOCAL: Run Python script directly
      return this._generateForecastLocal(userId);
    }
  }

  async _generateForecastRemote(userId) {
    try {
      const forecastUrl = `${this.mlServiceUrl}/api/forecast/${userId}`;
      console.log(`   Calling ML Service: ${forecastUrl}`);
      
      const response = await axios.get(forecastUrl, { 
        timeout: 300000 // 5 minutes
      });

      // ML service returns JSON with forecast data
      const result = response.data;
      
      // Save the forecast data locally if needed
      const filesDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
      fs.mkdirSync(filesDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const jsonFileName = `forecast_${userId}_${timestamp}.json`;
      const jsonPath = path.join(filesDir, jsonFileName);
      
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
      console.log("✅ Forecast JSON saved at:", jsonPath);
      
      // Generate Excel from JSON if needed
      // (You might need to implement this or modify ML service to return Excel)
      
      return jsonPath;
      
    } catch (err) {
      let errorMsg = err.message;
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText || "Server error";
      }
      console.error(`❌ Remote forecast failed:`, errorMsg);
      throw new Error(`Forecast failed: ${errorMsg}`);
    }
  }

  async _generateForecastLocal(userId) {
    const script = path.join(__dirname, "../../ml-service/forecastModel.py");
    const args = [userId.toString()];

    try {
      const stdout = await this.runScript(script, args);

      // Extract file path from output
      let pathMatch = stdout.match(/Output file:\s*(.+\.xlsx)/i) || 
                      stdout.match(/([^\s]+\.xlsx)/i);
      
      if (pathMatch) {
        const resultPath = pathMatch[1].trim();
        console.log("✅ Forecast saved at:", resultPath);
        
        // Auto-generate PDF
        try {
          const PDFService = require("./pdfService");
          
          let absoluteExcelPath = path.isAbsolute(resultPath) 
            ? resultPath 
            : path.resolve(path.join(__dirname, ".."), resultPath);
          
          if (!fs.existsSync(absoluteExcelPath)) {
            const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
            const fileName = path.basename(resultPath);
            const altPath = path.join(forecastDir, fileName);
            
            if (fs.existsSync(altPath)) {
              absoluteExcelPath = altPath;
            }
          }
          
          if (fs.existsSync(absoluteExcelPath)) {
            const pdfFileName = path.basename(absoluteExcelPath).replace(".xlsx", ".pdf");
            const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
            const pdfPath = path.join(pdfDir, pdfFileName);
            
            fs.mkdirSync(pdfDir, { recursive: true });
            
            await PDFService.generateForecastReport(absoluteExcelPath, pdfPath);
            console.log(`✅ PDF generated: ${pdfPath}`);
          }
        } catch (pdfErr) {
          console.error("⚠️ PDF generation failed:", pdfErr.message);
        }
        
        return resultPath;
      }
      
      throw new Error("Could not extract forecast file path from output");
    } catch (err) {
      console.error("❌ Local forecast failed:", err.message);
      throw err;
    }
  }

  // =====================================================
  // ✅ HYBRID: Evaluate Forecast
  // =====================================================
  async evaluateForecast(userId) {
    console.log(`📊 Evaluating forecast for User ID: ${userId}...`);
    
    const evaluateUrl = `${this.mlServiceUrl}/api/evaluate`;
    
    try {
      console.log(`   Calling: ${evaluateUrl}`);
      
      const response = await axios.post(evaluateUrl, 
        { user_id: userId.toString() },
        { timeout: 60000 }
      );

      console.log(`✅ Evaluation completed for user ${userId}`);
      return response.data;
    } catch (err) {
      let errorMsg = "Unknown error";
      
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText;
        console.error(`⚠️ Evaluation API returned ${err.response.status}: ${errorMsg}`);
      } else if (err.request) {
        errorMsg = "No response from ML service";
        console.error(`⚠️ ${errorMsg}`);
      } else {
        errorMsg = err.message;
        console.error(`⚠️ Request error: ${err.message}`);
      }
      
      throw new Error(`Evaluation failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ HYBRID: Check if Model Exists
  // =====================================================
  async checkIfModelExists(userId) {
    if (this.isProduction) {
      // PRODUCTION: Call ML Service API
      try {
        const statusUrl = `${this.mlServiceUrl}/api/model-status/${userId}`;
        const response = await axios.get(statusUrl, { timeout: 10000 });
        return response.data.model_exists || false;
      } catch (err) {
        console.error(`⚠️ Could not check model status (remote):`, err.message);
        return false;
      }
    } else {
      // LOCAL: Check file system directly
      const modelDir = path.join(__dirname, "../../ml-service/models", `user_${userId}`);
      
      if (!fs.existsSync(modelDir)) return false;
      
      const productDirs = fs.readdirSync(modelDir).filter(d => {
        const fullPath = path.join(modelDir, d);
        return fs.statSync(fullPath).isDirectory();
      });
      
      return productDirs.some(prodDir => {
        const lstmPath = path.join(modelDir, prodDir, "lstm_model.keras");
        const xgbPath = path.join(modelDir, prodDir, "xgb_model.json");
        return fs.existsSync(lstmPath) && fs.existsSync(xgbPath);
      });
    }
  }

  // =====================================================
  // ✅ HYBRID: Preprocess Data
  // =====================================================
  async preprocessData(userId, isWeekly = false) {
    console.log(`🔄 Starting preprocessing for User ID: ${userId}...`);
    console.log(`   Type: ${isWeekly ? 'WEEKLY' : 'TRAINING'}`);
    
    this.preprocessStatusByUserId.set(String(userId), {
      state: "running",
      progress: 0,
      message: "Starting data preprocessing...",
    });

    if (this.isProduction) {
      // PRODUCTION: Upload file to ML Service
      return this._preprocessDataRemote(userId, isWeekly);
    } else {
      // LOCAL: Run Python script
      return this._preprocessDataLocal(userId, isWeekly);
    }
  }

  async _preprocessDataRemote(userId, isWeekly) {
    try {
      const salesDataDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
      
      if (!fs.existsSync(salesDataDir)) {
        throw new Error(`No sales data found for user ${userId}`);
      }
      
      const files = fs.readdirSync(salesDataDir)
        .filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(salesDataDir, a));
          const statB = fs.statSync(path.join(salesDataDir, b));
          return statB.mtimeMs - statA.mtimeMs;
        });
      
      if (files.length === 0) {
        throw new Error(`No CSV/Excel files found for user ${userId}`);
      }
      
      const latestFile = files[0];
      const filePath = path.join(salesDataDir, latestFile);
      
      console.log(`📤 Uploading file to ML service: ${latestFile}`);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('user_id', userId.toString());
      formData.append('is_weekly', isWeekly.toString());
      
      const preprocessUrl = `${this.mlServiceUrl}/api/preprocess`;
      const response = await axios.post(preprocessUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      this.preprocessStatusByUserId.set(String(userId), {
        state: "done",
        progress: 100,
        message: "Preprocessing completed successfully!",
      });
      
      console.log(`✅ Remote preprocessing completed`);
      return response.data;
    } catch (err) {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "error",
        progress: 0,
        message: `Preprocessing failed: ${err.message}`,
      });
      
      throw new Error(`Remote preprocessing failed: ${err.message}`);
    }
  }

  async _preprocessDataLocal(userId, isWeekly) {
    const script = path.join(__dirname, "../../ml-service/processData.py");
    const args = [userId.toString(), isWeekly.toString()];

    try {
      const output = await this.runScript(script, args);
      
      this.preprocessStatusByUserId.set(String(userId), {
        state: "done",
        progress: 100,
        message: "Preprocessing completed successfully!",
      });
      
      console.log(`✅ Local preprocessing completed`);
      return output;
    } catch (err) {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "error",
        progress: 0,
        message: `Preprocessing failed: ${err.message}`,
      });
      
      throw err;
    }
  }

  // =====================================================
  // ✅ HYBRID: Train Model
  // =====================================================
  async trainModel(userId) {
    console.log(`🎯 Starting model training for User ID: ${userId}...`);

    if (this.isProduction) {
      // PRODUCTION: Call ML Service
      try {
        const trainUrl = `${this.mlServiceUrl}/api/train`;
        const response = await axios.post(trainUrl, 
          { user_id: userId.toString() },
          { timeout: 600000 } // 10 minutes
        );
        
        console.log(`✅ Remote training started`);
        return response.data;
      } catch (err) {
        throw new Error(`Remote training failed: ${err.message}`);
      }
    } else {
      // LOCAL: Run Python script
      const script = path.join(__dirname, "../../ml-service/trainModel.py");
      const args = [userId.toString()];

      try {
        const output = await this.runScript(script, args);
        console.log(`✅ Local training completed`);
        return output;
      } catch (err) {
        throw err;
      }
    }
  }

  // =====================================================
  // ✅ LOCAL ONLY: Convert Excel to CSV (using xlsx library)
  // =====================================================
  async convertToCsv(excelPath) {
    console.log(`🔄 Converting Excel to CSV: ${excelPath}`);
    
    try {
      const XLSX = require('xlsx');
      
      const workbook = XLSX.readFile(excelPath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const csvPath = excelPath.replace(/\.xlsx?$/i, ".csv");
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      fs.writeFileSync(csvPath, csv, 'utf8');
      
      console.log(`✅ Excel converted to CSV: ${csvPath}`);
      return csvPath;
    } catch (err) {
      console.error(`❌ Excel to CSV conversion failed:`, err.message);
      throw err;
    }
  }

  // =====================================================
  // ✅ LOCAL ONLY: Count rows (using xlsx library)
  // =====================================================
  async countRows(filePath) {
    try {
      if (filePath.endsWith('.csv')) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        return Math.max(0, lines.length - 1); // Exclude header
      } else if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        return data.length;
      }
      return 0;
    } catch (err) {
      console.error("❌ Failed to count rows:", err.message);
      return 0;
    }
  }
}

module.exports = new PythonService();