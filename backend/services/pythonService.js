// services/pythonService.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");

class PythonService {
  constructor() {
    // ✅ ML Service URL (Render webservice)
    this.mlServiceUrl = process.env.ML_SERVICE_URL || "https://kgs-sales-forecasting-ml-service.onrender.com";
    
    // Preprocess status tracking
    this.preprocessStatusByUserId = new Map();
    
    console.log(`🌐 ML Service URL: ${this.mlServiceUrl}`);
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
  // ✅ Generate Forecast (calls ML service API)
  // =====================================================
  async generateForecast(userId, horizonDays = null) {
    console.log(`📈 Generating forecast for User ID: ${userId}...`);
    if (horizonDays) {
      console.log(`   Note: horizonDays parameter is ignored - ML service generates all horizons (7d, 30d, 90d) by default`);
    }

    const forecastUrl = `${this.mlServiceUrl}/api/forecast`;
    
    try {
      console.log(`   Calling: ${forecastUrl}`);
      
      const response = await axios.post(
        forecastUrl,
        { user_id: userId.toString() },
        { 
          timeout: 300000, // 5 minutes for forecast generation
          responseType: 'arraybuffer' // Expect Excel file
        }
      );

      // Save the Excel file locally
      const filesDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
      fs.mkdirSync(filesDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const fileName = `forecast_${userId}_${timestamp}.xlsx`;
      const resultPath = path.join(filesDir, fileName);
      
      fs.writeFileSync(resultPath, response.data);
      console.log("✅ Forecast saved at:", resultPath);
      
      // Auto-generate PDF after Excel is created
      try {
        const PDFService = require("./pdfService");
        
        const pdfFileName = fileName.replace(".xlsx", ".pdf");
        const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
        const pdfPath = path.join(pdfDir, pdfFileName);
        
        // Ensure PDF directory exists
        fs.mkdirSync(pdfDir, { recursive: true });
        console.log(`📁 Created PDF directory: ${pdfDir}`);
        
        console.log(`📄 Auto-generating PDF report...`);
        console.log(`   Excel: ${resultPath}`);
        console.log(`   PDF: ${pdfPath}`);
        
        await PDFService.generateForecastReport(resultPath, pdfPath);
        
        // Verify PDF was created
        if (fs.existsSync(pdfPath)) {
          const pdfStats = fs.statSync(pdfPath);
          console.log(`✅ PDF report generated successfully!`);
          console.log(`   Path: ${pdfPath}`);
          console.log(`   Size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
        } else {
          console.error(`❌ PDF file was not created at: ${pdfPath}`);
        }
      } catch (pdfErr) {
        console.error("❌ Failed to auto-generate PDF (forecast still successful):", pdfErr.message);
        // Don't fail the forecast if PDF generation fails
      }
      
      return resultPath;
      
    } catch (err) {
      let errorMsg = "Unknown error";
      
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText || "Server error";
        const printable = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
        console.error(`❌ Forecast API returned ${err.response.status}: ${printable}`);
      } else if (err.request) {
        errorMsg = "No response from ML service - check if service is running";
        console.error(`❌ ${errorMsg}`);
      } else {
        errorMsg = err.message;
        console.error(`❌ Request error: ${err.message}`);
      }
      
      throw new Error(`Forecast failed: ${typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}`);
    }
  }

  // =====================================================
  // ✅ Evaluate Forecast (calls ML service API)
  // =====================================================
  async evaluateForecast(userId) {
    console.log(`📊 Evaluating forecast for User ID: ${userId}...`);
    
    try {
      const evaluateUrl = `${this.mlServiceUrl}/api/evaluate`;
      console.log(`   Calling: ${evaluateUrl}`);
      
      const payload = { user_id: userId.toString() };

      const response = await axios.post(evaluateUrl, payload, {
        timeout: 60000  // 60 second timeout for evaluation
      });

      console.log(`✅ Evaluation completed for user ${userId}`);
      console.log(`   Result: ${JSON.stringify(response.data, null, 2)}`);

      return response.data;
    } catch (err) {
      let errorMsg = "Unknown error";
      
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText || "Server error";
        const printable = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
        console.error(`⚠️ Evaluation API returned ${err.response.status}: ${printable}`);
      } else if (err.request) {
        errorMsg = "No response from ML service - check if service is running";
        console.error(`⚠️ ${errorMsg}`);
      } else {
        errorMsg = err.message;
        console.error(`⚠️ Request error: ${err.message}`);
      }
      
      throw new Error(`Evaluation failed: ${typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}`);
    }
  }

  // =====================================================
  // ✅ Check if model exists (calls ML service API)
  // =====================================================
  async checkIfModelExists(userId) {
    try {
      const statusUrl = `${this.mlServiceUrl}/api/model-status/${userId}`;
      const response = await axios.get(statusUrl, { timeout: 10000 });
      return response.data.model_exists || false;
    } catch (err) {
      console.error(`⚠️ Could not check model status: ${err.message}`);
      return false; // Assume no model if check fails
    }
  }

  // =====================================================
  // ✅ Preprocess Data (calls ML service API)
  // =====================================================
  async preprocessData(userId, isWeekly = false) {
    console.log(`🔄 Starting preprocessing for User ID: ${userId}...`);
    console.log(`   Type: ${isWeekly ? 'WEEKLY' : 'TRAINING'}`);
    
    this.preprocessStatusByUserId.set(String(userId), {
      state: "running",
      progress: 0,
      message: "Starting data preprocessing...",
    });

    try {
      const preprocessUrl = `${this.mlServiceUrl}/api/preprocess`;
      console.log(`   Calling: ${preprocessUrl}`);
      
      // Find the uploaded file to send to ML service
      const salesDataDir = path.join(__dirname, "../files/salesData", `user_${userId}`);
      
      if (!fs.existsSync(salesDataDir)) {
        throw new Error(`No sales data found for user ${userId}`);
      }
      
      const files = fs.readdirSync(salesDataDir)
        .filter(f => f.endsWith('.csv') || f.endsWith('.xlsx'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(salesDataDir, a));
          const statB = fs.statSync(path.join(salesDataDir, b));
          return statB.mtimeMs - statA.mtimeMs; // Most recent first
        });
      
      if (files.length === 0) {
        throw new Error(`No CSV/Excel files found for user ${userId}`);
      }
      
      const latestFile = files[0];
      const filePath = path.join(salesDataDir, latestFile);
      
      console.log(`📤 Uploading file: ${latestFile}`);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('user_id', userId.toString());
      formData.append('is_weekly', isWeekly.toString());
      
      const response = await axios.post(preprocessUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 120000, // 2 minutes
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      this.preprocessStatusByUserId.set(String(userId), {
        state: "done",
        progress: 100,
        message: "Preprocessing completed successfully!",
      });
      
      console.log(`✅ Preprocessing completed for user ${userId}`);
      console.log(`   Response: ${JSON.stringify(response.data)}`);
      
      return response.data;
    } catch (err) {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "error",
        progress: 0,
        message: `Preprocessing failed: ${err.message}`,
      });
      
      let errorMsg = err.message;
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText || "Server error";
      }
      
      console.error(`❌ Preprocessing failed for user ${userId}:`, errorMsg);
      throw new Error(`Preprocessing failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Train Model (calls ML service API)
  // =====================================================
  async trainModel(userId) {
    console.log(`🎯 Starting model training for User ID: ${userId}...`);

    try {
      const trainUrl = `${this.mlServiceUrl}/api/train`;
      console.log(`   Calling: ${trainUrl}`);
      
      const response = await axios.post(
        trainUrl,
        { user_id: userId.toString() },
        { timeout: 600000 } // 10 minutes for training
      );

      console.log(`✅ Model training completed for user ${userId}`);
      console.log(`   Response: ${JSON.stringify(response.data)}`);
      
      return response.data;
    } catch (err) {
      let errorMsg = err.message;
      if (err.response) {
        const rd = err.response.data;
        errorMsg = rd?.detail || rd?.message || err.response.statusText || "Server error";
      }
      
      console.error(`❌ Model training failed for user ${userId}:`, errorMsg);
      throw new Error(`Training failed: ${errorMsg}`);
    }
  }

  // =====================================================
  // ✅ Convert Excel to CSV (local utility)
  // =====================================================
  async convertToCsv(excelPath) {
    console.log(`🔄 Converting Excel to CSV: ${excelPath}`);
    
    try {
      // Use a lightweight library for conversion
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
  // ✅ Count rows in CSV or Excel file (local utility)
  // =====================================================
  async countRows(filePath) {
    try {
      if (filePath.endsWith('.csv')) {
        // Count CSV rows
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        return Math.max(0, lines.length - 1); // Exclude header
      } else if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
        // Count Excel rows
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