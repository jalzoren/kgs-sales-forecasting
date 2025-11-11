// services/pythonService.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class PythonService {
  constructor() {
    this.pythonPath = "D:/kgs-sales-forecasting/ml-service/venv/Scripts/python.exe"; // ✅ central path
    this.preprocessStatusByUserId = new Map();
  }

  runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
      console.log(`🐍 Using Python at: ${this.pythonPath}`);

      const python = spawn(this.pythonPath, [scriptPath, ...args]);
      let output = "";
      let errorMsg = "";

      python.stdout.on("data", (data) => (output += data.toString()));
      python.stderr.on("data", (data) => (errorMsg += data.toString()));

      python.on("close", (code) => {
        if (code !== 0 || errorMsg.includes("ERROR"))
          return reject(new Error(errorMsg || "Python script failed"));
        resolve(output.trim());
      });
    });
  }

  async convertToCsv(filePath) {
    console.log("🧮 Auto-converting Excel to CSV for faster processing...");
    const convertScript = path.join(__dirname, "../../ml-service/convertToCsv.py");
    const stdout = await this.runScript(convertScript, [filePath]);
    const convertedPath = stdout.trim();

    if (convertedPath && fs.existsSync(convertedPath)) {
      console.log(`✅ Excel converted successfully: ${convertedPath}`);
      return convertedPath;
    }
    console.log("⚠️ Conversion failed, using original Excel file.");
    return filePath;
  }

  async countRows(filePath) {
    const countScript = path.join(__dirname, "../../ml-service/countRows.py");
    const output = await this.runScript(countScript, [filePath]);
    const count = parseInt(output.trim(), 10);
    if (isNaN(count)) throw new Error("Invalid count output");
    return count;
  }

  async preprocessData(userId) {
    console.log(`🚀 Launching Python preprocessing for User ID: ${userId}...`);
    const processScript = path.join(__dirname, "../../ml-service/processData.py");

    return new Promise((resolve, reject) => {
      this.preprocessStatusByUserId.set(String(userId), {
        state: "running",
        progress: 0,
        message: "Starting preprocessing...",
        updatedAt: Date.now(),
      });

      // ✅ FIXED: now uses `this.pythonPath`
      const python = spawn(this.pythonPath, [processScript, userId.toString()]);

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
        } else if (text.includes("Normalizing sales values")) {
          progress = Math.max(progress, 92);
          message = "Normalizing sales values...";
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
        const text = data.toString();
        console.error("🐍 Python Error:", text);
        this.preprocessStatusByUserId.set(String(userId), {
          state: "error",
          progress: this.preprocessStatusByUserId.get(String(userId))?.progress || 0,
          message: text,
          updatedAt: Date.now(),
        });
      });

      python.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Python preprocessing finished for User ID: ${userId}`);
          const status = this.preprocessStatusByUserId.get(String(userId)) || {};
          this.preprocessStatusByUserId.set(String(userId), {
            state: "done",
            progress: 100,
            message: status.message || "Preprocessing complete.",
            updatedAt: Date.now(),
          });
          resolve();
        } else {
          this.preprocessStatusByUserId.set(String(userId), {
            state: "error",
            progress: this.preprocessStatusByUserId.get(String(userId))?.progress || 0,
            message: `Python script exited with code ${code}`,
            updatedAt: Date.now(),
          });
          reject(new Error(`Python script exited with code ${code}`));
        }
      });
    });
  }

  async trainModel(userId) {
    console.log(`🧠 Starting model training for User ID: ${userId}...`);
    const trainScript = path.join(__dirname, "../../ml-service/trainModel.py");

    // ✅ FIXED: now uses `this.pythonPath`
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [trainScript, userId.toString()]);

      python.stdout.on("data", (data) => console.log("🧩 Python Train:", data.toString()));
      python.stderr.on("data", (data) => console.error("🐍 Python Train Error:", data.toString()));

      python.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Model training completed successfully for User ID: ${userId}`);
          resolve();
        } else {
          reject(new Error(`Training script exited with code ${code}`));
        }
      });
    });
  }

  // ✅ Added missing method
  getPreprocessStatus(userId) {
    return this.preprocessStatusByUserId.get(String(userId)) || {
      state: "idle",
      progress: 0,
      message: "No preprocessing started yet.",
    };
  }
}

module.exports = new PythonService();
