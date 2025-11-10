// services/pythonService.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class PythonService {
  runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
      const python = spawn("python", [scriptPath, ...args]);
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
      const python = spawn("python", [processScript, userId.toString()]);

      python.stdout.on("data", (data) => console.log("Python:", data.toString()));
      python.stderr.on("data", (data) => console.error("🐍 Python Error:", data.toString()));

      python.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Python preprocessing finished for User ID: ${userId}`);
          resolve();
        } else {
          reject(new Error(`Python script exited with code ${code}`));
        }
      });
    });
  }
}

module.exports = new PythonService();
