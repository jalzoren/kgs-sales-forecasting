// backend/services/analyticsService.js
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

class AnalyticsService {
  /**
   * Get the forecast directory path for a user
   * @param {number} userId - User ID
   * @returns {string} Absolute path to forecast directory
   */
  getForecastDirectory(userId) {
    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    return path.resolve(forecastDir);
  }

  /**
   * Check if forecast directory exists
   * @param {string} directoryPath - Path to check
   * @returns {boolean} True if exists
   */
  directoryExists(directoryPath) {
    return fs.existsSync(directoryPath);
  }

  /**
   * Get all Excel files from directory, sorted by modification time (newest first)
   * @param {string} directoryPath - Directory to scan
   * @returns {Array} Array of file objects with fileName, filePath, and mtime
   */
  getExcelFiles(directoryPath) {
    const dirContents = fs.readdirSync(directoryPath);
    console.log(`📁 Files in directory:`, dirContents);
    
    return dirContents
      .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
      .map((fileName) => {
        const filePath = path.join(directoryPath, fileName);
        const stats = fs.statSync(filePath);
        return { fileName, filePath, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * Read Excel workbook and return sheet names
   * @param {string} filePath - Path to Excel file
   * @returns {Object} { workbook, sheetNames }
   */
  readExcelWorkbook(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames || [];
    return { workbook, sheetNames };
  }

  /**
   * Map horizon parameter to sheet name
   * @param {string} horizon - Horizon identifier (7d, 30d, 90d)
   * @returns {string} Sheet name
   */
  getSheetNameForHorizon(horizon) {
    const sheetMap = {
      "7d": "7d_forecast",
      "30d": "30d_forecast", 
      "90d": "90d_forecast"
    };
    return sheetMap[horizon];
  }

  /**
   * Find the appropriate sheet for the given horizon
   * @param {Array} sheetNames - Available sheet names
   * @param {string} horizon - Horizon identifier
   * @returns {string|null} Sheet name or null if not found
   */
  findTargetSheet(sheetNames, horizon) {
    const expectedSheetName = this.getSheetNameForHorizon(horizon);
    
    // Try exact match first
    let targetSheet = sheetNames.find(name => name === expectedSheetName);
    
    // Fallback strategies
    if (!targetSheet) {
      console.warn(`⚠️ Sheet ${expectedSheetName} not found`);
      targetSheet = sheetNames.find(s => s.toLowerCase().includes(horizon)) || 
                    sheetNames.find(s => s.toLowerCase().includes("forecast")) ||
                    sheetNames[0];
    }
    
    return targetSheet;
  }

  /**
   * Read data from a specific worksheet
   * @param {Object} workbook - XLSX workbook object
   * @param {string} sheetName - Name of sheet to read
   * @returns {Array} Array of row objects
   */
  readSheetData(workbook, sheetName) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet ${sheetName} not found in workbook`);
    }
    return XLSX.utils.sheet_to_json(worksheet);
  }

  /**
   * Helper to get value from row using multiple possible column names
   * @param {Object} row - Data row
   * @param {Array} possibleNames - Array of possible column names
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Column value or default
   */
  getValue(row, possibleNames, defaultValue = null) {
    for (const name of possibleNames) {
      const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
      if (key !== undefined && row[key] !== null && row[key] !== undefined) {
        return row[key];
      }
    }
    return defaultValue;
  }

  /**
   * Parse various date formats (Excel serial, datetime strings, Date objects)
   * @param {*} dateRaw - Raw date value
   * @param {Date} fallbackDate - Fallback date if parsing fails
   * @returns {string} Formatted date string (YYYY-MM-DD)
   */
  parseDate(dateRaw, fallbackDate) {
    if (!dateRaw) {
      return fallbackDate.toISOString().split('T')[0];
    }
    
    if (dateRaw instanceof Date) {
      return dateRaw.toISOString().split('T')[0];
    }
    
    if (typeof dateRaw === 'number') {
      // Excel serial date number (days since 1900-01-01)
      const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
      const jsDate = new Date(EXCEL_EPOCH.getTime() + (dateRaw * 86400 * 1000));
      
      const year = jsDate.getUTCFullYear();
      const month = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(jsDate.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    if (typeof dateRaw === 'string') {
      // Handle datetime strings like "2025-11-24 00:00:00"
      if (dateRaw.includes(' ')) {
        return dateRaw.split(' ')[0];
      } else {
        const parsed = new Date(dateRaw);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        } else {
          const match = dateRaw.match(/\d{4}-\d{2}-\d{2}/);
          return match ? match[0] : fallbackDate.toISOString().split('T')[0];
        }
      }
    }
    
    return fallbackDate.toISOString().split('T')[0];
  }

  /**
   * Transform raw Excel data into analytics format
   * @param {Array} data - Raw Excel data
   * @param {Object} fileInfo - File metadata (fileName, mtime)
   * @param {string} targetSheet - Sheet name being processed
   * @returns {Array} Formatted analytics data
   */
  formatAnalyticsData(data, fileInfo, targetSheet) {
    return data.map((row, index) => {
      const dateRaw = this.getValue(row, ["Date", "date", "Day"]);
      const product = this.getValue(row, ["Product_Name", "Product Name", "product_name", "Product"], "All Products");
      const category = this.getValue(row, ["Category", "category"], "All");
      const forecastedRaw = this.getValue(row, ["Forecast_Qty", "Forecast Qty", "forecast_qty", "Forecasted", "Units_Sold"], 0);
      const revenueRaw = this.getValue(row, ["Revenue_Estimate", "Revenue Estimate", "revenue_estimate", "Revenue"], 0);
      const priceRaw = this.getValue(row, ["Avg_Unit_Price", "Avg Unit Price", "avg_unit_price", "Unit_Price", "Price"], 0);
      
      const forecasted = parseFloat(forecastedRaw) || 0;
      const revenue = parseFloat(revenueRaw) || 0;
      const price = parseFloat(priceRaw) || 0;

      const formattedDate = this.parseDate(dateRaw, fileInfo.mtime);
      
      // Debug log for first few rows
      if (index < 3 && typeof dateRaw === 'number') {
        console.log(`  Excel serial ${dateRaw} → ${formattedDate}`);
      }

      return {
        date: formattedDate,
        product: String(product),
        category: String(category),
        forecasted: forecasted,
        revenue: revenue || (forecasted * price),
        price: price,
        fileName: fileInfo.fileName,
        horizon: targetSheet
      };
    });
  }

  /**
   * Sort data by date chronologically
   * @param {Array} data - Array of data objects with date property
   * @returns {Array} Sorted array
   */
  sortByDate(data) {
    return data.sort((a, b) => {
      try {
        return new Date(a.date) - new Date(b.date);
      } catch {
        return 0;
      }
    });
  }

  /**
   * Get expected number of days for a horizon
   * @param {string} horizon - Horizon identifier (7d, 30d, 90d)
   * @returns {number} Number of expected days
   */
  getExpectedDays(horizon) {
    return horizon === "7d" ? 7 : horizon === "30d" ? 30 : 90;
  }

  /**
   * Filter data to keep only the last N days
   * @param {Array} sortedData - Sorted analytics data
   * @param {number} expectedDays - Number of days to keep
   * @returns {Array} Filtered data
   */
  filterLastNDays(sortedData, expectedDays) {
    // Get all unique dates, sorted
    const uniqueDates = Array.from(new Set(sortedData.map(d => d.date))).sort();
    
    console.log(`📊 Found ${uniqueDates.length} unique dates in file`);
    if (uniqueDates.length > 0) {
      console.log(`📅 All dates: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
    }
    
    // Take the LAST N days from sorted data
    const datesToKeep = uniqueDates.slice(-expectedDays);
    
    if (datesToKeep.length > 0) {
      console.log(`✅ Keeping last ${expectedDays} days: ${datesToKeep[0]} to ${datesToKeep[datesToKeep.length - 1]}`);
    }
    
    // Filter data to only include those dates
    return sortedData.filter(item => datesToKeep.includes(item.date));
  }

  /**
   * Log summary information about filtered data
   * @param {Array} filteredData - Filtered analytics data
   * @param {string} horizon - Horizon identifier
   */
  logDataSummary(filteredData, horizon) {
    console.log(`✅ Returning ${filteredData.length} records for ${horizon}`);
    
    if (filteredData.length > 0) {
      const firstDate = new Date(filteredData[0].date);
      const dayOfWeek = firstDate.getDay();
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      console.log(`📅 First forecast date: ${filteredData[0].date} (${dayName})`);
      console.log(`📅 Last forecast date: ${filteredData[filteredData.length - 1].date}`);
    }
  }
}

module.exports = new AnalyticsService();