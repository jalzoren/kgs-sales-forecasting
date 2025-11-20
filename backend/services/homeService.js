const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

class HomeService {
  /**
   * Get sales data directory for a user
   * @param {number} userId - User ID
   * @returns {string} Absolute path to sales directory
   */
  getSalesDirectory(userId) {
    return path.join(__dirname, "../files/salesData", `user_${userId}`);
  }

  /**
   * Get forecast data directory for a user
   * @param {number} userId - User ID
   * @returns {string} Absolute path to forecast directory
   */
  getForecastDirectory(userId) {
    return path.join(__dirname, "../files/forecastData", `user_${userId}`);
  }

  /**
   * Check if both required directories exist
   * @param {string} salesFolder - Sales directory path
   * @param {string} forecastFolder - Forecast directory path
   * @returns {boolean} True if both exist
   */
  validateDirectories(salesFolder, forecastFolder) {
    return fs.existsSync(salesFolder) && fs.existsSync(forecastFolder);
  }

  /**
   * Get files from directory sorted by modified time (newest first)
   * @param {string} folder - Directory path
   * @param {Array} exts - Array of file extensions to filter (e.g., ['.xlsx', '.csv'])
   * @returns {Array} Array of file objects with fileName, filePath, and mtime
   */
  getFiles(folder, exts = ['.xlsx', '.csv']) {
    return fs.readdirSync(folder)
      .filter(f => exts.includes(path.extname(f)) && !f.startsWith('~$'))
      .map(f => ({
        fileName: f,
        filePath: path.join(folder, f),
        mtime: fs.statSync(path.join(folder, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * Parse various date formats to YYYY-MM-DD string
   * @param {*} val - Raw date value (Date, number, string)
   * @returns {string|null} Formatted date or null
   */
  parseDate(val) {
    if (!val) return null;
    
    // Handle Date objects
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    
    // Handle Excel serial numbers
    if (typeof val === 'number') {
      const date = new Date(Date.UTC(1899, 11, 30) + val * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    
    // Handle string dates (with or without time)
    if (typeof val === 'string') {
      return val.split(' ')[0]; // Extract date part from datetime string
    }
    
    return null;
  }

  /**
   * Read sales data from Excel or CSV file and aggregate by date
   * @param {Object} fileInfo - File object with fileName and filePath
   * @returns {Array} Array of {date, revenue} objects
   */
  readSalesData(fileInfo) {
    try {
      let data = [];

      // Read Excel file
      if (fileInfo.fileName.endsWith('.xlsx')) {
        const workbook = XLSX.readFile(fileInfo.filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(sheet);
      }
      // Read CSV file
      else if (fileInfo.fileName.endsWith('.csv')) {
        const lines = fs.readFileSync(fileInfo.filePath, 'utf8')
          .split('\n')
          .filter(l => l.trim());

        if (lines.length < 2) return [];

        // Parse CSV headers and rows
        const headers = lines[0].split(',').map(h => h.trim());
        data = lines.slice(1).map(line => {
          const row = {};
          line.split(',').forEach((v, i) => {
            row[headers[i]] = v;
          });
          return row;
        });
      }

      // Aggregate revenue by date
      const revenueByDate = new Map();
      data.forEach(row => {
        const date = this.parseDate(row.Date || row.date);
        const revenue = parseFloat(row.Total_Amount || 0);
        
        if (date) {
          const currentRevenue = revenueByDate.get(date) || 0;
          revenueByDate.set(date, currentRevenue + revenue);
        }
      });

      // Convert Map to array of objects
      return Array.from(revenueByDate.entries()).map(([date, revenue]) => ({
        date,
        revenue
      }));

    } catch (err) {
      console.error("❌ Error reading sales file:", err.message);
      return [];
    }
  }

  /**
   * Read forecast data from Excel file and aggregate by date
   * @param {Object} fileInfo - File object with fileName and filePath
   * @param {string} sheetName - Name of sheet to read (default: '7d_forecast')
   * @returns {Array} Array of {date, revenue} objects
   */
  readForecastData(fileInfo, sheetName = '7d_forecast') {
    try {
      const workbook = XLSX.readFile(fileInfo.filePath);

      // Fallback if specified sheet doesn't exist
      if (!workbook.SheetNames.includes(sheetName)) {
        sheetName = workbook.SheetNames[0];
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      // Aggregate revenue by date
      const revenueByDate = new Map();
      data.forEach(row => {
        const date = this.parseDate(row.Date || row.date);
        const revenue = parseFloat(row.Revenue_Estimate || 0);
        
        if (date) {
          const currentRevenue = revenueByDate.get(date) || 0;
          revenueByDate.set(date, currentRevenue + revenue);
        }
      });

      // Convert Map to array of objects
      return Array.from(revenueByDate.entries()).map(([date, revenue]) => ({
        date,
        revenue
      }));

    } catch (err) {
      console.error("❌ Error reading forecast file:", err.message);
      return [];
    }
  }

  /**
   * Extract date range from forecast filename
   * @param {string} fileName - Forecast filename (e.g., forecast_week_20250101_to_20250107.xlsx)
   * @returns {Object|null} {start: Date, end: Date} or null if pattern doesn't match
   */
  extractDateRangeFromFilename(fileName) {
    const match = fileName.match(/forecast_week_(\d{8})_to_(\d{8})/);
    if (!match) return null;

    const startStr = match[1]; // e.g., "20250101"
    const endStr = match[2];   // e.g., "20250107"

    const start = new Date(
      `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}`
    );
    const end = new Date(
      `${endStr.slice(0, 4)}-${endStr.slice(4, 6)}-${endStr.slice(6, 8)}`
    );

    return { start, end };
  }

  /**
   * Find matching forecast file for given sales data
   * Matches based on date ranges in filename
   * @param {Array} salesData - Array of sales data with dates
   * @param {Array} forecastFiles - Array of forecast file objects
   * @returns {Array} Forecast data from matching file, or empty array
   */
  findMatchingForecast(salesData, forecastFiles) {
    if (salesData.length === 0) return [];

    const firstSalesDate = new Date(salesData[0].date);
    const lastSalesDate = new Date(salesData[salesData.length - 1].date);

    // Search for forecast file that covers the sales date range
    for (const file of forecastFiles) {
      const dateRange = this.extractDateRangeFromFilename(file.fileName);
      if (!dateRange) continue;

      const { start, end } = dateRange;

      // Check if sales dates fall within forecast range
      const isFirstInRange = firstSalesDate >= start && firstSalesDate <= end;
      const isLastInRange = lastSalesDate >= start && lastSalesDate <= end;

      if (isFirstInRange || isLastInRange) {
        return this.readForecastData(file, '7d_forecast');
      }
    }

    return [];
  }

  /**
   * Combine sales, forecast, and future data by date
   * @param {Array} salesData - Actual sales data
   * @param {Array} forecastData - Forecasted sales data (past prediction)
   * @param {Array} futureData - Future forecast data
   * @returns {Array} Combined array with actual_revenue, forecasted_revenue, future_revenue
   */
  combineDataByDate(salesData, forecastData, futureData) {
    const dataMap = new Map();

    // Add actual sales data
    salesData.forEach(d => {
      dataMap.set(d.date, {
        date: d.date,
        actual_revenue: d.revenue,
        forecasted_revenue: null,
        future_revenue: null
      });
    });

    // Add forecasted revenue (for dates we already have sales for)
    forecastData.forEach(d => {
      if (dataMap.has(d.date)) {
        dataMap.get(d.date).forecasted_revenue = d.revenue;
      } else {
        dataMap.set(d.date, {
          date: d.date,
          actual_revenue: null,
          forecasted_revenue: d.revenue,
          future_revenue: null
        });
      }
    });

    // Add future revenue
    futureData.forEach(d => {
      if (dataMap.has(d.date)) {
        dataMap.get(d.date).future_revenue = d.revenue;
      } else {
        dataMap.set(d.date, {
          date: d.date,
          actual_revenue: null,
          forecasted_revenue: null,
          future_revenue: d.revenue
        });
      }
    });

    // Convert Map to sorted array
    return Array.from(dataMap.values()).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
  }

  /**
   * Build complete dashboard data response
   * @param {Object} params - Parameters object
   * @param {Array} params.salesFiles - Array of sales file objects
   * @param {Array} params.forecastFiles - Array of forecast file objects
   * @param {Array} params.salesData - Processed sales data
   * @param {Array} params.forecastData - Processed forecast data
   * @param {Array} params.futureData - Processed future data
   * @param {Array} params.combinedData - Combined data by date
   * @returns {Object} Dashboard response object
   */
  buildDashboardResponse({ salesFiles, forecastFiles, salesData, forecastData, futureData, combinedData }) {
    return {
      success: true,
      salesFile: salesFiles[0].fileName,
      forecastFile: forecastFiles.length > 1 ? forecastFiles[1].fileName : forecastFiles[0].fileName,
      futureFile: forecastFiles[0].fileName,
      salesData,
      forecastData,
      futureData,
      combinedData
    };
  }

  /**
   * Build empty dashboard response (no data available)
   * @param {string} message - Message to display
   * @returns {Object} Empty dashboard response
   */
  buildEmptyResponse(message) {
    return {
      success: true,
      message,
      salesData: [],
      forecastData: [],
      futureData: [],
      combinedData: []
    };
  }
}

module.exports = new HomeService();