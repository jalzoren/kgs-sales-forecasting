// services/pythonService.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class PythonService {
  constructor() {
    // ✅ Central Python path (venv)
    this.pythonPath =
      "D:/kgs-sales-forecasting/ml-service/venv/Scripts/python.exe";

    // Forecast history JSON
    this.historyPath = path.join(__dirname, "../../ml-service/forecast_history.json");

    // Preprocess status tracking
    this.preprocessStatusByUserId = new Map();
  }

  // =====================================================
  // ✅ Core runner for Python scripts
  // =====================================================
  runScript(scriptPath, args = [], options = {}) {
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
          reject(
            new Error(`Python exited with code ${code}. Error:\n${errorMsg || "Unknown"}`)
          );
        }
      });
    });
  }

  // =====================================================
  // ✅ Preprocess status getter
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
  // ✅ Generate Forecast
  // =====================================================
  async generateForecast(userId, horizonDays = 90) {
    console.log(`📈 Generating forecast for User ID: ${userId}...`);

    const script = path.join(__dirname, "../../ml-service/forecastModel.py");

    // Python args: userId + optional horizon
    const args = [userId.toString(), "--horizon", String(horizonDays)];

    let status = "Completed";
    let resultPath = null;

    try {
      const stdout = await this.runScript(script, args);

      // Extract the saved file path from Python stdout
      const pathMatch = stdout.match(/Output file:\s*(.+\.xlsx)/i);
      if (pathMatch) {
        resultPath = pathMatch[1].trim();
        console.log("✅ Forecast saved at:", resultPath);
      } else {
        console.warn("⚠️ Could not parse output file path from Python stdout");
      }
    } catch (err) {
      console.error("❌ Forecast generation failed:", err.message || err);
      status = "Failed";
    }

    // Save history record
    const record = {
      userId: String(userId),
      date: new Date().toLocaleString(),
      horizon: horizonDays === 7 ? "Next Week" : horizonDays === 30 ? "Next 30 days" : "Next 90 days",
      scope: "All Products",
      status,
      filePath: resultPath ? path.relative(path.join(__dirname, "../../backend"), resultPath).replace(/\\/g, "/") : null
    };

    try {
      this.saveForecastHistory(record);
    } catch (e) {
      console.error("❌ Could not save forecast history:", e);
    }

    return resultPath;
  }

  // =====================================================
  // ✅ Save forecast history to JSON
  // =====================================================
  saveForecastHistory(record) {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let history = [];
      if (fs.existsSync(this.historyPath)) {
        const raw = fs.readFileSync(this.historyPath, "utf8").trim();
        history = raw ? JSON.parse(raw) : [];
      }

      history.push(record);
      fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2), "utf8");
      console.log("📁 Forecast history saved:", this.historyPath);
    } catch (err) {
      console.error("❌ Failed to save forecast history:", err);
      throw err;
    }
  }

  // =====================================================
  // ✅ Read forecast history
  // =====================================================
  getForecastHistory() {
    try {
      if (!fs.existsSync(this.historyPath)) return [];
      const raw = fs.readFileSync(this.historyPath, "utf8").trim();
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("❌ Failed to read forecast history:", err);
      return [];
    }
  }

  // =====================================================
  // ✅ Check if model exists
  // =====================================================
  checkIfModelExists(userId) {
    const modelDir = path.join(__dirname, "../../ml-service/models", `user_${userId}`);
    const lstmPath = path.join(modelDir, "lstm_model.keras");
    const xgbPath = path.join(modelDir, "xgb_model.json");
    return fs.existsSync(lstmPath) && fs.existsSync(xgbPath);
  }

  // =====================================================
  // ✅ Preprocess Data
  // =====================================================
  async preprocessData(userId) {
    console.log(`🔄 Starting preprocessing for User ID: ${userId}...`);
    
    // Update status
    this.preprocessStatusByUserId.set(String(userId), {
      state: "running",
      progress: 0,
      message: "Starting data preprocessing...",
    });

    const script = path.join(__dirname, "../../ml-service/processData.py");
    const args = [userId.toString()];

    try {
      const output = await this.runScript(script, args);
      
      this.preprocessStatusByUserId.set(String(userId), {
        state: "done",
        progress: 100,
        message: "Preprocessing completed successfully!",
      });
      
      console.log(`✅ Preprocessing completed for user ${userId}`);
      return output;
    } catch (err) {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "error",
        progress: 0,
        message: `Preprocessing failed: ${err.message}`,
      });
      console.error(`❌ Preprocessing failed for user ${userId}:`, err.message);
      throw err;
    }
  }

  // =====================================================
  // ✅ Train Model
  // =====================================================
  async trainModel(userId) {
    console.log(`🎯 Starting model training for User ID: ${userId}...`);

    const script = path.join(__dirname, "../../ml-service/trainModel.py");
    const args = [userId.toString()];

    try {
      const output = await this.runScript(script, args);
      console.log(`✅ Model training completed for user ${userId}`);
      return output;
    } catch (err) {
      console.error(`❌ Model training failed for user ${userId}:`, err.message);
      throw err;
    }
  }

  // =====================================================
  // ✅ Convert Excel to CSV
  // =====================================================
  async convertToCsv(excelPath) {
    console.log(`🔄 Converting Excel to CSV: ${excelPath}`);
    
    const script = path.join(__dirname, "../../ml-service/convertToCsv.py");
    const args = [excelPath];

    try {
      const output = await this.runScript(script, args);
      // The Python script should output the CSV file path
      // Extract it from output or construct it
      const csvPath = excelPath.replace(/\.xlsx?$/, ".csv");
      
      if (fs.existsSync(csvPath)) {
        console.log(`✅ Excel converted to CSV: ${csvPath}`);
        return csvPath;
      } else {
        // Try to extract path from output
        const pathMatch = output.match(/([^\s]+\.csv)/);
        if (pathMatch && fs.existsSync(pathMatch[1])) {
          return pathMatch[1];
        }
        throw new Error("CSV file not found after conversion");
      }
    } catch (err) {
      console.error(`❌ Excel to CSV conversion failed:`, err.message);
      throw err;
    }
  }

  // =====================================================
  // ✅ Count rows in CSV or Excel file
  // =====================================================
  async countRows(filePath) {
    try {
      // Create a simple Python script to count rows
      const countScript = `
import sys
import pandas as pd

file_path = sys.argv[1]

try:
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path, encoding='utf-8', on_bad_lines='skip', engine='python')
    elif file_path.endswith('.xlsx') or file_path.endswith('.xls'):
        df = pd.read_excel(file_path)
    else:
        print(0)
        sys.exit(0)
    
    # Count non-empty rows (excluding header)
    row_count = len(df.dropna(how='all'))
    print(row_count)
except Exception as e:
    print(0)
    sys.exit(1)
`;

      // Write temporary script
      const tempScriptPath = path.join(__dirname, "../../ml-service/temp_count_rows.py");
      fs.writeFileSync(tempScriptPath, countScript, "utf8");

      try {
        const output = await this.runScript(tempScriptPath, [filePath]);
        const count = parseInt(output.trim(), 10);
        
        // Clean up temp script
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
        
        return isNaN(count) ? 0 : count;
      } catch (err) {
        // Clean up temp script on error
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
        console.error("❌ Error counting rows:", err.message);
        return 0;
      }
    } catch (err) {
      console.error("❌ Failed to count rows:", err.message);
      return 0;
    }
  }
}

module.exports = new PythonService();
