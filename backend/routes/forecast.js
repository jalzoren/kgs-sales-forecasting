// routes/forecast.js
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { requireAuth } = require("../middleware/authMiddleware.js");
const PythonService = require("../services/pythonService");

// Get forecast history for the logged-in user
router.get("/api/forecast/history", requireAuth, (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      console.log("❌ No user ID in session");
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    console.log(`🔍 Fetching forecast history for user ${userId}`);

    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    const absoluteForecastDir = path.resolve(forecastDir);

    console.log(`📂 Checking forecast directory: ${absoluteForecastDir}`);

    if (!fs.existsSync(absoluteForecastDir)) {
      console.log(`📂 No forecast directory found for user ${userId} at ${absoluteForecastDir}`);
      return res.json([]);
    }

    // Get all Excel files, excluding temp files (starting with ~$)
    let files;
    try {
      const allFiles = fs.readdirSync(absoluteForecastDir);
      console.log(`📁 All files in directory:`, allFiles);
      
      files = allFiles
        .filter((f) => {
          const isExcel = f.endsWith(".xlsx");
          const isNotTemp = !f.startsWith("~$");
          return isExcel && isNotTemp;
        })
        .map((fileName) => {
          const filePath = path.join(absoluteForecastDir, fileName);
          try {
            const stats = fs.statSync(filePath);
            return { fileName, filePath, mtime: stats.mtime };
          } catch (statErr) {
            console.error(`⚠️ Error getting stats for ${fileName}:`, statErr.message);
            return null;
          }
        })
        .filter(f => f !== null)
        .sort((a, b) => b.mtime - a.mtime); // Sort by newest first
    } catch (readErr) {
      console.error(`❌ Error reading directory ${absoluteForecastDir}:`, readErr.message);
      return res.status(500).json({ message: "Failed to read forecast directory", error: readErr.message });
    }

    console.log(`📁 Found ${files.length} forecast file(s) in ${absoluteForecastDir}`);
    files.forEach(f => console.log(`   - ${f.fileName}`));

    const forecasts = [];

    for (const file of files) {
      try {
        // Extract date from filename patterns:
        // New format: forecast_week_20251111_to_20251118.xlsx
        // Old format: forecast_20251115_094424.xlsx or forecast_summary_20251114_123342.xlsx
        let forecastDate;
        const weekMatch = file.fileName.match(/forecast_week_(\d{8})_to_(\d{8})\.xlsx/);
        const timestampMatch = file.fileName.match(/(\d{8})_(\d{6})/);

        if (weekMatch) {
          // New week-based format: use the week start date
          const weekStartStr = weekMatch[1]; // YYYYMMDD
          forecastDate = new Date(
            `${weekStartStr.substring(0, 4)}-${weekStartStr.substring(4, 6)}-${weekStartStr.substring(6, 8)}`
          );
          console.log(`📅 Found week-based forecast: ${file.fileName} (Week: ${weekMatch[1]} to ${weekMatch[2]})`);
        } else if (timestampMatch) {
          // Old timestamp format
          const dateStr = timestampMatch[1]; // YYYYMMDD
          const timeStr = timestampMatch[2]; // HHMMSS
          forecastDate = new Date(
            `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)} ` +
            `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}:${timeStr.substring(4, 6)}`
          );
        } else {
          // Fallback to file modification time
          forecastDate = file.mtime;
        }

        // Format date for display: "November 15, 2025 | 12:33 PM"
        const datePart = forecastDate.toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const timePart = forecastDate.toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const formattedDate = `${datePart} | ${timePart}`;

        // Read Excel file to check available horizons
        if (!fs.existsSync(file.filePath)) {
          console.error(`❌ File does not exist: ${file.filePath}`);
          continue;
        }

        let workbook;
        let sheetNames = [];
        
        try {
          workbook = XLSX.readFile(file.filePath);
          sheetNames = workbook.SheetNames || [];
          console.log(`📋 Available sheets in ${file.fileName}:`, sheetNames);
        } catch (xlsxErr) {
          console.error(`❌ Error reading Excel file ${file.fileName}:`, xlsxErr.message);
          // Add entry with "Failed" status
          const fallbackDate = file.mtime.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          const fallbackTime = file.mtime.toLocaleString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          forecasts.push({
            id: `${file.fileName}_error`,
            date: `${fallbackDate} | ${fallbackTime}`,
            dateISO: file.mtime.toISOString(),
            horizons: [],
            horizon: "Error",
            scope: "All Products",
            status: "Failed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          continue;
        }

        // Check for each horizon (7d, 30d, 90d) and collect all available ones
        const horizonConfigs = [
          { days: 7, label: "Next Week", sheetName: "7d_forecast" },
          { days: 30, label: "Next 30 days", sheetName: "30d_forecast" },
          { days: 90, label: "Next 90 days", sheetName: "90d_forecast" },
        ];

        const availableHorizons = [];
        for (const horizon of horizonConfigs) {
          if (sheetNames.includes(horizon.sheetName)) {
            availableHorizons.push({
              days: horizon.days,
              label: horizon.label,
            });
            console.log(`✅ Found horizon: ${file.fileName} - ${horizon.label}`);
          } else {
            console.log(`⚠️ Sheet "${horizon.sheetName}" not found in ${file.fileName}. Available: ${sheetNames.join(", ")}`);
          }
        }

        // Create a single entry for this file with all available horizons
        if (availableHorizons.length > 0) {
          forecasts.push({
            id: file.fileName,
            date: formattedDate,
            dateISO: forecastDate.toISOString(), // For sorting
            horizons: availableHorizons, // Array of all available horizons
            horizon: availableHorizons.map(h => h.label).join(", "), // Combined string for display/search
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          console.log(`✅ Added forecast file: ${file.fileName} with ${availableHorizons.length} horizon(s)`);
        } else if (sheetNames.length > 0) {
          // If no standard horizons found but file exists, add a generic entry
          console.log(`⚠️ No standard forecast sheets found in ${file.fileName}, but file has ${sheetNames.length} sheet(s). Adding generic entry.`);
          forecasts.push({
            id: file.fileName,
            date: formattedDate,
            dateISO: forecastDate.toISOString(),
            horizons: [],
            horizon: "Available",
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
        }
      } catch (err) {
        console.error(`⚠️ Error processing forecast file ${file.fileName}:`, err.message);
        console.error(`   Stack:`, err.stack);
        // Add entry even if file read fails
        const fallbackDate = file.mtime.toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const fallbackTime = file.mtime.toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        forecasts.push({
          id: `${file.fileName}_unknown`,
          date: `${fallbackDate} | ${fallbackTime}`,
          dateISO: file.mtime.toISOString(), // For sorting
          horizons: [],
          horizon: "Unknown",
          scope: "All Products",
          status: "Failed",
          accuracy: "N/A",
          filePath: `files/forecastData/user_${userId}/${file.fileName}`,
        });
      }
    }

    console.log(`✅ Returning ${forecasts.length} forecast records for user ${userId}`);
    res.json(forecasts);
  } catch (err) {
    console.error("❌ Forecast history error:", err);
    console.error("   Stack:", err.stack);
    return res.status(500).json({ message: "Failed to get forecast history", error: err.message });
  }
});

// Generate a new forecast (reforecast)
router.post("/api/forecast", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    const { horizon } = req.body;
    const horizonDays = horizon || 90; // Default to 90 days

    console.log(`📈 Generating forecast for user ${userId} with horizon: ${horizonDays} days`);

    // Generate forecast asynchronously
    PythonService.generateForecast(userId, horizonDays)
      .then((resultPath) => {
        if (resultPath) {
          console.log(`✅ Forecast generated successfully: ${resultPath}`);
        } else {
          console.warn(`⚠️ Forecast generation completed but no file path returned`);
        }
      })
      .catch((err) => {
        console.error(`❌ Forecast generation error:`, err.message);
      });

    // Return immediately (forecast runs in background)
    res.json({
      message: "Forecast generation started. It will appear in your history when complete.",
      horizon: horizonDays,
    });
  } catch (err) {
    console.error("❌ Forecast request error:", err);
    return res.status(500).json({ message: "Failed to start forecast generation", error: err.message });
  }
});

// Get forecast files for a user (legacy endpoint, kept for compatibility)
router.get("/files/:userId", (req, res) => {
  const { userId } = req.params;

  const dirPath = path.join(__dirname, "../files/forecastData", `user_${userId}`);

  if (!fs.existsSync(dirPath)) return res.json([]);

  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
    .map((filename) => ({
      filename,
      url: `/files/forecastData/user_${userId}/${filename}`,
      date: fs.statSync(path.join(dirPath, filename)).mtime,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json(files);
});

module.exports = router;
