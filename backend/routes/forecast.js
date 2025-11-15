// routes/forecast.js
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { requireAuth } = require("../middleware/authMiddleware.js");
const PythonService = require("../services/pythonService");
const PDFService = require("../services/pdfService");

// Helper function to ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

// Helper function to generate PDF if it doesn't exist
async function ensurePDFExists(excelFilePath, userId) {
  try {
    const fileName = path.basename(excelFilePath);
    const baseFileName = fileName.replace(/\.xlsx$/i, "");
    const pdfFileName = `${baseFileName}.pdf`;
    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const pdfPath = path.join(pdfDir, pdfFileName);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found for ${fileName}, generating...`);
      ensureDirectoryExists(pdfDir);
      await PDFService.generateForecastReport(excelFilePath, pdfPath);
      console.log(`✅ Generated PDF: ${pdfFileName}`);
    } else {
      console.log(`✅ PDF already exists: ${pdfFileName}`);
    }
    
    return pdfPath;
  } catch (err) {
    console.error(`⚠️ Failed to generate PDF:`, err.message);
    throw err;
  }
}

// Get forecast history for the logged-in user
router.get("/api/forecast/history", requireAuth, async (req, res) => {
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
      console.log(`📂 No forecast directory found for user ${userId}`);
      return res.json([]);
    }

    // Get all Excel files, excluding temp files
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
      console.error(`❌ Error reading directory:`, readErr.message);
      return res.status(500).json({ 
        message: "Failed to read forecast directory", 
        error: readErr.message 
      });
    }

    console.log(`📁 Found ${files.length} forecast file(s)`);

    const forecasts = [];

    for (const file of files) {
      try {
        const uploadDate = file.mtime;
        
        console.log(`📅 Processing: ${file.fileName}`);
        console.log(`   Modified: ${uploadDate.toISOString()}`);

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
          console.log(`📋 Sheets in ${file.fileName}:`, sheetNames);
        } catch (xlsxErr) {
          console.error(`❌ Error reading Excel: ${xlsxErr.message}`);
          forecasts.push({
            id: `${file.fileName}_error`,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: [],
            horizon: "Error",
            scope: "All Products",
            status: "Failed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          continue;
        }

        // Check for each horizon
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
            console.log(`✅ Found: ${horizon.label}`);
          }
        }

        // Auto-generate PDF if needed
        try {
          await ensurePDFExists(file.filePath, userId);
        } catch (pdfErr) {
          console.error(`⚠️ PDF generation failed for ${file.fileName}:`, pdfErr.message);
          // Continue anyway - forecast entry will still be added
        }

        // Create entry with available horizons
        if (availableHorizons.length > 0) {
          forecasts.push({
            id: file.fileName,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: availableHorizons,
            horizon: availableHorizons.map(h => h.label).join(", "),
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          console.log(`✅ Added: ${file.fileName} (${availableHorizons.length} horizons)`);
        } else if (sheetNames.length > 0) {
          // File exists but no standard sheets
          console.log(`⚠️ No standard sheets in ${file.fileName}`);
          forecasts.push({
            id: file.fileName,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: [],
            horizon: "Available",
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
        }
      } catch (err) {
        console.error(`⚠️ Error processing ${file.fileName}:`, err.message);
        forecasts.push({
          id: `${file.fileName}_unknown`,
          date: file.mtime.toISOString(),
          dateISO: file.mtime.toISOString(),
          fileName: file.fileName,
          horizons: [],
          horizon: "Unknown",
          scope: "All Products",
          status: "Failed",
          accuracy: "N/A",
          filePath: `files/forecastData/user_${userId}/${file.fileName}`,
        });
      }
    }

    console.log(`✅ Returning ${forecasts.length} forecast records`);
    res.json(forecasts);
  } catch (err) {
    console.error("❌ Forecast history error:", err);
    console.error("   Stack:", err.stack);
    return res.status(500).json({ 
      message: "Failed to get forecast history", 
      error: err.message 
    });
  }
});

// Generate a new forecast (reforecast)
router.post("/api/forecast", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    console.log(`📈 Generating forecast for user ${userId} (all horizons)`);

    // Generate forecast asynchronously
    PythonService.generateForecast(userId, null)
      .then((resultPath) => {
        if (resultPath) {
          console.log(`✅ Forecast generated: ${resultPath}`);
        } else {
          console.warn(`⚠️ Forecast completed but no file path returned`);
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
    return res.status(500).json({ 
      message: "Failed to start forecast generation", 
      error: err.message 
    });
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

// Get forecast PDF file for viewing
router.get("/api/forecast/view/:fileName", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let { fileName } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    // Decode URL-encoded filename
    fileName = decodeURIComponent(fileName);
    console.log(`🔍 View PDF request: "${fileName}" (user ${userId})`);

    // Sanitize filename
    const sanitizedFileName = path.basename(fileName);
    const baseFileName = sanitizedFileName.replace(/\.(xlsx|pdf)$/i, "");
    const pdfFileName = `${baseFileName}.pdf`;

    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const absolutePdfDir = path.resolve(pdfDir);
    const pdfFilePath = path.join(absolutePdfDir, pdfFileName);
    const absolutePdfPath = path.resolve(pdfFilePath);

    console.log(`📂 PDF directory: ${absolutePdfDir}`);
    console.log(`📄 PDF file: ${absolutePdfPath}`);

    // Security check: ensure file is within user's directory
    if (!absolutePdfPath.startsWith(absolutePdfDir)) {
      console.error(`❌ Security violation: path outside user directory`);
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if directory exists
    if (!fs.existsSync(absolutePdfDir)) {
      console.log(`📁 Creating PDF directory: ${absolutePdfDir}`);
      ensureDirectoryExists(absolutePdfDir);
    }

    // If PDF doesn't exist, generate it from Excel
    if (!fs.existsSync(absolutePdfPath)) {
      console.log(`⚠️ PDF not found, generating from Excel...`);
      
      const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
      const excelFileName = `${baseFileName}.xlsx`;
      const excelFilePath = path.join(forecastDir, excelFileName);
      const absoluteExcelPath = path.resolve(excelFilePath);
      
      if (!fs.existsSync(absoluteExcelPath)) {
        console.error(`❌ Excel file not found: ${absoluteExcelPath}`);
        const allPDFs = fs.existsSync(absolutePdfDir) 
          ? fs.readdirSync(absolutePdfDir).filter(f => f.endsWith(".pdf") && !f.startsWith("~$"))
          : [];
        return res.status(404).json({ 
          message: `Excel file not found: ${excelFileName}`,
          availableFiles: allPDFs
        });
      }

      try {
        console.log(`📄 Generating PDF from: ${absoluteExcelPath}`);
        await PDFService.generateForecastReport(absoluteExcelPath, absolutePdfPath);
        console.log(`✅ PDF generated: ${absolutePdfPath}`);
      } catch (pdfErr) {
        console.error(`❌ PDF generation failed:`, pdfErr.message);
        console.error(`   Stack:`, pdfErr.stack);
        return res.status(500).json({ 
          message: `Failed to generate PDF: ${pdfErr.message}`,
          error: pdfErr.message
        });
      }
    }

    // Verify PDF exists before sending
    if (!fs.existsSync(absolutePdfPath)) {
      console.error(`❌ PDF still doesn't exist after generation attempt`);
      return res.status(500).json({ 
        message: "PDF generation completed but file not found"
      });
    }

    console.log(`✅ Sending PDF: ${absolutePdfPath}`);
    
    // Send PDF file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdfFileName}"`);
    res.sendFile(absolutePdfPath, (err) => {
      if (err) {
        console.error(`❌ Error sending file:`, err);
        if (!res.headersSent) {
          res.status(500).json({ 
            message: "Failed to send PDF file",
            error: err.message
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ Error viewing forecast PDF:", err);
    console.error("   Stack:", err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: "Failed to view forecast PDF", 
        error: err.message 
      });
    }
  }
});

// Generate PDF report from forecast Excel file (download)
router.get("/api/forecast/pdf/:fileName", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let { fileName } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    // Decode URL-encoded filename
    fileName = decodeURIComponent(fileName);
    console.log(`📄 PDF download request: "${fileName}" (user ${userId})`);

    // Sanitize filename
    const sanitizedFileName = path.basename(fileName);
    if (!sanitizedFileName.endsWith(".xlsx")) {
      return res.status(400).json({ 
        message: "Invalid file format. Only .xlsx files are supported." 
      });
    }

    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    const absoluteForecastDir = path.resolve(forecastDir);
    const excelFilePath = path.join(absoluteForecastDir, sanitizedFileName);
    const absoluteExcelPath = path.resolve(excelFilePath);

    console.log(`📂 Excel directory: ${absoluteForecastDir}`);
    console.log(`📄 Excel file: ${absoluteExcelPath}`);

    // Security check
    if (!absoluteExcelPath.startsWith(absoluteForecastDir)) {
      console.error(`❌ Security violation: path outside user directory`);
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if Excel file exists
    if (!fs.existsSync(absoluteExcelPath)) {
      console.error(`❌ Excel file not found: ${absoluteExcelPath}`);
      return res.status(404).json({ 
        message: `File not found: ${sanitizedFileName}` 
      });
    }

    // Generate PDF filename
    const pdfFileName = sanitizedFileName.replace(".xlsx", ".pdf");
    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const pdfFilePath = path.join(pdfDir, pdfFileName);
    const absolutePdfPath = path.resolve(pdfFilePath);

    console.log(`📄 PDF output: ${absolutePdfPath}`);

    // Ensure PDF directory exists
    ensureDirectoryExists(pdfDir);

    // Generate or regenerate PDF
    try {
      console.log(`📄 Generating PDF from: ${absoluteExcelPath}`);
      await PDFService.generateForecastReport(absoluteExcelPath, absolutePdfPath);
      console.log(`✅ PDF generated: ${absolutePdfPath}`);
    } catch (pdfErr) {
      console.error(`❌ PDF generation failed:`, pdfErr.message);
      console.error(`   Stack:`, pdfErr.stack);
      return res.status(500).json({ 
        message: "Failed to generate PDF",
        error: pdfErr.message
      });
    }

    // Verify PDF exists
    if (!fs.existsSync(absolutePdfPath)) {
      console.error(`❌ PDF not found after generation`);
      return res.status(500).json({ 
        message: "PDF generation completed but file not found"
      });
    }

    console.log(`✅ Sending PDF for download: ${absolutePdfPath}`);

    // Send PDF file for download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFileName}"`);
    res.sendFile(absolutePdfPath, (err) => {
      if (err) {
        console.error(`❌ Error sending file:`, err);
        if (!res.headersSent) {
          res.status(500).json({ 
            message: "Failed to send PDF file",
            error: err.message
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    console.error("   Stack:", err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: "Failed to generate PDF", 
        error: err.message 
      });
    }
  }
});

// Get forecast files for a user (legacy endpoint)
router.get("/files/:userId", (req, res) => {
  const { userId } = req.params;

  const dirPath = path.join(__dirname, "../files/forecastData", `user_${userId}`);

  if (!fs.existsSync(dirPath)) {
    return res.json([]);
  }

  try {
    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
      .map((filename) => {
        try {
          const filePath = path.join(dirPath, filename);
          return {
            filename,
            url: `/files/forecastData/user_${userId}/${filename}`,
            date: fs.statSync(filePath).mtime,
          };
        } catch (err) {
          console.error(`⚠️ Error reading file ${filename}:`, err.message);
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(files);
  } catch (err) {
    console.error("❌ Error reading forecast files:", err);
    res.status(500).json({ 
      message: "Failed to read forecast files",
      error: err.message
    });
  }
});

module.exports = router;