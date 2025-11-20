const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { requireAuth } = require("../middleware/authMiddleware.js");

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
        const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(EXCEL_EPOCH.getTime() + (dateRaw * 86400 * 1000));
        
        const year = jsDate.getUTCFullYear();
        const month = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jsDate.getUTCDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
        
        if (index < 3) {
          console.log(`  Excel serial ${dateRaw} → ${formattedDate}`);
        }
      } else if (typeof dateRaw === 'string') {
        if (dateRaw.includes(' ')) {
          formattedDate = dateRaw.split(' ')[0];
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
    const datesToKeep = uniqueDates.slice(-expectedDays);

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

module.exports = router;