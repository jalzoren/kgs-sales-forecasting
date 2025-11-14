// services/pythonService.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class PythonService {
  constructor() {
    // ✅ Central Python path (venv)
    this.pythonPath =
      "D:/kgs-sales-forecasting/ml-service/venv/Scripts/python.exe";
    this.preprocessStatusByUserId = new Map();
  }

  // =====================================================
  // ✅ Core runner for all Python scripts
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
            new Error(
              `Python exited with code ${code}. Error:\n${
                errorMsg || "Unknown"
              }`
            )
          );
        }
      });
    });
  }

  // =====================================================
  // ✅ Excel → CSV Converter
  // =====================================================
  async convertToCsv(filePath) {
    console.log("🧮 Auto-converting Excel to CSV for faster processing...");
    const script = path.join(__dirname, "../../ml-service/convertToCsv.py");
    const stdout = await this.runScript(script, [filePath]);
    const convertedPath = stdout.trim();

    if (convertedPath && fs.existsSync(convertedPath)) {
      console.log(`✅ Excel converted successfully: ${convertedPath}`);
      return convertedPath;
    }
    console.log("⚠️ Conversion failed, using original Excel file.");
    return filePath;
  }

  // =====================================================
  // ✅ Row Counter
  // =====================================================
  async countRows(filePath) {
    const script = path.join(__dirname, "../../ml-service/countRows.py");
    const output = await this.runScript(script, [filePath]);
    const count = parseInt(output.trim(), 10);
    if (isNaN(count)) throw new Error("Invalid row count output");
    return count;
  }

  // =====================================================
  // ✅ Data Preprocessing with Status Tracking
  // =====================================================
  async preprocessData(userId) {
    console.log(`🚀 Launching Python preprocessing for User ID: ${userId}...`);
    const script = path.join(__dirname, "../../ml-service/processData.py");

    return new Promise((resolve, reject) => {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "running",
        progress: 0,
        message: "Starting preprocessing...",
        updatedAt: Date.now(),
      });

      const python = spawn(this.pythonPath, [script, userId.toString()]);

      python.stdout.on("data", (data) => {
        const text = data.toString();
        console.log("Python:", text);

        const status = this.preprocessStatusByUserId.get(String(userId)) || {};
        let progress = status.progress || 0;
        let message = status.message || "";

        if (text.includes("Reading sales data")) {
          progress = Math.max(progress, 10);
          message = "Reading sales data...";
        } else if (text.includes("Cleaning raw data")) {
          progress = Math.max(progress, 20);
          message = "Cleaning raw data...";
        } else if (text.includes("Aggregating daily sales data")) {
          progress = Math.max(progress, 40);
          message = "Aggregating daily sales data...";
        } else if (text.includes("Generating features")) {
          progress = Math.max(progress, 55);
          message = "Generating features...";
        } else if (text.includes("Computing rolling & lag features")) {
          progress = Math.max(progress, 70);
          message = "Computing rolling and lag features...";
        } else if (text.includes("Calculating trend index")) {
          progress = Math.max(progress, 85);
          message = "Calculating trend index...";
        } else if (text.includes("Processed data saved")) {
          progress = 100;
          message = "Preprocessing complete.";
        }

        this.preprocessStatusByUserId.set(String(userId), {
          state: progress >= 100 ? "done" : "running",
          progress,
          message,
          updatedAt: Date.now(),
        });
      });

      python.stderr.on("data", (data) => {
        console.error("🐍 Python Error:", data.toString());
        this.preprocessStatusByUserId.set(String(userId), {
          state: "error",
          progress:
            this.preprocessStatusByUserId.get(String(userId))?.progress || 0,
          message: data.toString(),
          updatedAt: Date.now(),
        });
      });

      python.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Preprocessing finished for User ID: ${userId}`);
          this.preprocessStatusByUserId.set(String(userId), {
            state: "done",
            progress: 100,
            message: "Preprocessing complete.",
            updatedAt: Date.now(),
          });
          resolve();
        } else {
          reject(new Error(`Python exited with code ${code}`));
        }
      });
    });
  }

  // =====================================================
  // ✅ Model Training
  // =====================================================
  async trainModel(userId) {
    console.log(`🧠 Starting model training for User ID: ${userId}...`);
    const script = path.join(__dirname, "../../ml-service/trainModel.py");
    if (!this.checkIfModelExists(userId)) {
      console.log("⚠️ No model found. Training new model...");
    }

    await this.runScript(script, [userId.toString()]);
    console.log(`✅ Model training completed successfully for User ${userId}`);
  }

  // =====================================================
  // ✅ Forecast Generation (supports weekly/30/90-day horizon)
  // =====================================================
  async generateForecast(userId, horizonDays = 90) {
    console.log(`📈 Generating forecast for User ID: ${userId}...`);
    const script = path.join(__dirname, "../../ml-service/forecastModel.py");

    // ensure horizon is an integer
    const args = [userId.toString(), "--horizon", String(horizonDays)];
    const result = await this.runScript(script, args);
    console.log(`✅ Forecast generation completed for User ${userId}`);
    return result;
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
  // ✅ Utility: Check if user’s model already exists
  // =====================================================
  checkIfModelExists(userId) {
    const modelDir = path.join(
      __dirname,
      "../../ml-service/models",
      `user_${userId}`
    );
    const lstmPath = path.join(modelDir, "lstm_model.keras");
    const xgbPath = path.join(modelDir, "xgb_model.json");
    return fs.existsSync(lstmPath) && fs.existsSync(xgbPath);
  }
}

module.exports = new PythonService();