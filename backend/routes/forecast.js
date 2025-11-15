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
        // Use file modification time as the primary date (represents when forecast was generated/uploaded)
        // This matches the behavior in Data.jsx which shows uploadDate
        // mtime is when the file was created/modified, which is when the forecast was generated
        const uploadDate = file.mtime; // This is when the file was created = when forecast was generated
        
        console.log(`📅 File: ${file.fileName}`);
        console.log(`   Modification time (upload/generation date): ${uploadDate.toISOString()}`);

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
          forecasts.push({
            id: `${file.fileName}_error`,
            date: file.mtime.toISOString(), // ISO string for frontend formatting
            dateISO: file.mtime.toISOString(),
            fileName: file.fileName, // Add filename for display
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
            date: uploadDate.toISOString(), // ISO string for frontend formatting (upload/generation date)
            dateISO: uploadDate.toISOString(), // For sorting (upload/generation date)
            fileName: file.fileName, // Add filename for display
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
            date: uploadDate.toISOString(), // ISO string for frontend formatting (upload/generation date)
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName, // Add filename for display
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
        forecasts.push({
          id: `${file.fileName}_unknown`,
          date: file.mtime.toISOString(), // ISO string for frontend formatting
          dateISO: file.mtime.toISOString(), // For sorting
          fileName: file.fileName, // Add filename for display
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

    // Generate forecast for all horizons (7d, 30d, 90d) - no specific horizon needed
    // The forecastModel.py generates all horizons by default
    console.log(`📈 Generating forecast for user ${userId} (all horizons: 7d, 30d, 90d)`);

    // Generate forecast asynchronously - pass null to generate all horizons
    PythonService.generateForecast(userId, null)
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
      message: "Forecast generation started for all horizons (Next Week, Next 30 days, Next 90 days). It will appear in your history when complete.",
    });
  } catch (err) {
    console.error("❌ Forecast request error:", err);
    return res.status(500).json({ message: "Failed to start forecast generation", error: err.message });
  }
});

// Get parsed forecast data for analytics
router.get("/api/forecast/analytics", requireAuth, async (req, res) => {
  console.log("🔍 Analytics endpoint hit!");
  try {
    const userId = req.session.user?.id;
    const horizon = req.query.horizon || "90d"; // Get horizon from query parameter
    
    console.log(`📊 Fetching analytics for user ${userId}, horizon: ${horizon}`);
    
    if (!userId) {
      console.log("❌ No user ID in session");
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    const absoluteForecastDir = path.resolve(forecastDir);

    console.log(`📂 Absolute forecast directory: ${absoluteForecastDir}`);

    if (!fs.existsSync(absoluteForecastDir)) {
      console.log(`❌ No forecast directory found`);
      return res.json([]);
    }

    // Get the latest Excel file
    let allFiles;
    try {
      const dirContents = fs.readdirSync(absoluteForecastDir);
      console.log(`📁 Files in directory:`, dirContents);
      
      allFiles = dirContents
        .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
        .map((fileName) => {
          const filePath = path.join(absoluteForecastDir, fileName);
          const stats = fs.statSync(filePath);
          return { fileName, filePath, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);
      
      console.log(`📄 Found ${allFiles.length} Excel file(s)`);
    } catch (readErr) {
      console.error(`❌ Error reading directory:`, readErr.message);
      return res.status(500).json({ message: "Failed to read forecast directory", error: readErr.message });
    }

    if (allFiles.length === 0) {
      console.log(`⚠️ No Excel files found`);
      return res.json([]);
    }

    const latestFile = allFiles[0];
    console.log(`📄 Reading: ${latestFile.fileName}`);

    // Read Excel file
    let workbook;
    try {
      workbook = XLSX.readFile(latestFile.filePath);
    } catch (readErr) {
      console.error(`❌ Error reading Excel file:`, readErr.message);
      return res.status(500).json({ message: "Failed to read Excel file", error: readErr.message });
    }

    const sheetNames = workbook.SheetNames || [];
    console.log(`📋 Available sheets:`, sheetNames);

    // Map horizon to sheet name
    const sheetMap = {
      "7d": "7d_forecast",
      "30d": "30d_forecast", 
      "90d": "90d_forecast"
    };
    
    let targetSheet = sheetNames.find(name => name === sheetMap[horizon]);
    
    // Fallback if exact sheet not found
    if (!targetSheet) {
      console.warn(`⚠️ Sheet ${sheetMap[horizon]} not found`);
      targetSheet = sheetNames.find(s => s.toLowerCase().includes(horizon)) || 
                    sheetNames.find(s => s.toLowerCase().includes("forecast")) ||
                    sheetNames[0];
    }

    console.log(`✅ Using sheet: ${targetSheet} for ${horizon}`);

    const worksheet = workbook.Sheets[targetSheet];
    if (!worksheet) {
      console.error(`❌ Sheet ${targetSheet} not found`);
      return res.status(500).json({ message: `Sheet ${targetSheet} not found` });
    }

    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📊 Read ${data.length} rows from ${targetSheet}`);
    
    if (data.length === 0) {
      console.warn(`⚠️ No data in sheet ${targetSheet}`);
      return res.json([]);
    }
    
    if (data.length > 0) {
      console.log(`📋 Sample row:`, data[0]);
    }

    // Helper to get values from different column name variations
    const getValue = (row, possibleNames, defaultValue = null) => {
      for (const name of possibleNames) {
        const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
        if (key !== undefined && row[key] !== null && row[key] !== undefined) {
          return row[key];
        }
      }
      return defaultValue;
    };

    // Format data for analytics
    const formattedData = data.map((row, index) => {
      const dateRaw = getValue(row, ["Date", "date", "Day"]);
      const product = getValue(row, ["Product_Name", "Product Name", "product_name", "Product"], "All Products");
      const category = getValue(row, ["Category", "category"], "All");
      const forecastedRaw = getValue(row, ["Forecast_Qty", "Forecast Qty", "forecast_qty", "Forecasted", "Units_Sold"], 0);
      const revenueRaw = getValue(row, ["Revenue_Estimate", "Revenue Estimate", "revenue_estimate", "Revenue"], 0);
      const priceRaw = getValue(row, ["Avg_Unit_Price", "Avg Unit Price", "avg_unit_price", "Unit_Price", "Price"], 0);
      
      const forecasted = parseFloat(forecastedRaw) || 0;
      const revenue = parseFloat(revenueRaw) || 0;
      const price = parseFloat(priceRaw) || 0;

      // Parse date correctly - handle Excel date formats AND datetime strings
      let formattedDate;
      if (!dateRaw) {
        formattedDate = latestFile.mtime.toISOString().split('T')[0];
      } else if (dateRaw instanceof Date) {
        formattedDate = dateRaw.toISOString().split('T')[0];
      } else if (typeof dateRaw === 'number') {
        // Excel serial date number (days since 1900-01-01)
        // Excel has a leap year bug in 1900, so we need to adjust
        const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899 in UTC
        const jsDate = new Date(EXCEL_EPOCH.getTime() + (dateRaw * 86400 * 1000));
        
        // Use UTC methods to avoid timezone shifts
        const year = jsDate.getUTCFullYear();
        const month = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jsDate.getUTCDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
        
        // Debug log to verify conversion
        if (index < 3) {
          console.log(`  Excel serial ${dateRaw} → ${formattedDate}`);
        }
      } else if (typeof dateRaw === 'string') {
        // Handle datetime strings like "2025-11-24 00:00:00"
        // Extract just the date part
        if (dateRaw.includes(' ')) {
          formattedDate = dateRaw.split(' ')[0]; // Get "2025-11-24" from "2025-11-24 00:00:00"
        } else {
          const parsed = new Date(dateRaw);
          if (!isNaN(parsed.getTime())) {
            formattedDate = parsed.toISOString().split('T')[0];
          } else {
            const match = dateRaw.match(/\d{4}-\d{2}-\d{2}/);
            formattedDate = match ? match[0] : latestFile.mtime.toISOString().split('T')[0];
          }
        }
      } else {
        formattedDate = latestFile.mtime.toISOString().split('T')[0];
      }

      return {
        date: formattedDate,
        product: String(product),
        category: String(category),
        forecasted: forecasted,
        revenue: revenue || (forecasted * price),
        price: price,
        fileName: latestFile.fileName,
        horizon: targetSheet
      };
    });

    // Sort by date to ensure proper chronological order
// Sort by date to ensure proper chronological order
const sortedData = formattedData.sort((a, b) => {
  try {
    return new Date(a.date) - new Date(b.date);
  } catch {
    return 0;
  }
});

// DYNAMIC FIX: Take only the exact number of days we need based on horizon
const expectedDays = horizon === "7d" ? 7 : horizon === "30d" ? 30 : 90;

// Get all unique dates, sorted
const uniqueDates = Array.from(new Set(sortedData.map(d => d.date))).sort();

console.log(`📊 Found ${uniqueDates.length} unique dates in file`);
console.log(`📅 All dates: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);

// Strategy: Take the LAST N days from the sorted data
// This handles cases where Python generates extra days at the beginning
const datesToKeep = uniqueDates.slice(-expectedDays); // Take last N dates

console.log(`✅ Keeping last ${expectedDays} days: ${datesToKeep[0]} to ${datesToKeep[datesToKeep.length - 1]}`);

// Filter data to only include those dates
const filteredData = sortedData.filter(item => datesToKeep.includes(item.date));

console.log(`✅ Returning ${filteredData.length} records for ${horizon}`);

if (filteredData.length > 0) {
  const firstDate = new Date(filteredData[0].date);
  const dayOfWeek = firstDate.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
  
  console.log(`📅 First forecast date: ${filteredData[0].date} (${dayName})`);
  console.log(`📅 Last forecast date: ${filteredData[filteredData.length - 1].date}`);
}

res.json(filteredData);
  } catch (err) {
    console.error("❌ Analytics error:", err);
    console.error("   Stack:", err.stack);
    return res.status(500).json({ message: "Failed to get analytics data", error: err.message });
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
