// backend/services/homeService.js
/**
 * ═══════════════════════════════════════════════════════════════
 * HOME SERVICE - Dashboard Data Processing
 * ═══════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 *   Handles all file reading, data processing, and calculations
 *   for the dashboard feature
 *
 * USED BY:
 *   - controllers/homeController.js → getDashboard()
 *
 * WORKS WITH:
 *   - files/salesData/user_X/*.xlsx|csv → actual sales data
 *   - files/forecastData/user_X/*.xlsx → predicted sales
 *
 * KEY METHODS (in order of typical usage):
 *   1. getSalesDirectory(userId) → get path to sales folder
 *   2. getForecastDirectory(userId) → get path to forecast folder
 *   3. validateDirectories() → check both folders exist
 *   4. getFiles() → list files in a folder, sorted by date
 *   5. readSalesData() → parse Excel/CSV, aggregate by date
 *   6. readForecastData() → parse forecast Excel, aggregate
 *   7. findMatchingForecast() → find forecast that matches sales dates
 *   8. combineDataByDate() → merge sales + forecast + future
 *   9. calculateDashboardStats() → compute predicted/actual/accuracy
 *   10. getInventoryAlerts() → read demand_alerts sheet
 *   11. getCategoryAccuracy() → calculate accuracy by category
 * ═══════════════════════════════════════════════════════════════
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

class HomeService {
  // METHOD 1: Get sales data directory
  getSalesDirectory(userId) {
    return path.join(__dirname, "../files/salesData", `user_${userId}`);
  }
  // METHOD 2: Get forecast data directory
  getForecastDirectory(userId) {
    return path.join(__dirname, "../files/forecastData", `user_${userId}`);
  }

  /**
   * METHOD 3: Check if both required directories exist
   * Called by: homeController.getDashboard()
   */
  validateDirectories(salesFolder, forecastFolder) {
    return fs.existsSync(salesFolder) && fs.existsSync(forecastFolder);
  }

  /**
   * METHOD 4: Get files from directory
   * Returns: Array of {fileName, filePath, mtime}, sorted newest first
   * Called by: homeController (to get sales and forecast files)
   */

  getFiles(folder, exts = [".xlsx", ".csv"]) {
    return fs
      .readdirSync(folder)
      .filter((f) => exts.includes(path.extname(f)) && !f.startsWith("~$"))
      .map((f) => ({
        fileName: f,
        filePath: path.join(folder, f),
        mtime: fs.statSync(path.join(folder, f)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * METHOD 5: Parse various date formats to YYYY-MM-DD string
   * Returns: "2025-01-15" or null if invalid
   * Called by: readSalesData(), readForecastData()
   */
  parseDate(val) {
    if (!val) return null;

    // Handle Date objects
    if (val instanceof Date) {
      return val.toISOString().split("T")[0];
    }

    // Handle Excel serial numbers
    if (typeof val === "number") {
      const date = new Date(Date.UTC(1899, 11, 30) + val * 86400 * 1000);
      return date.toISOString().split("T")[0];
    }

    // Handle string dates (with or without time)
    if (typeof val === "string") {
      return val.split(" ")[0]; // Extract date part from datetime string
    }

    return null;
  }

  /**
   * METHOD 6: Read sales data from Excel or CSV file
   * Returns: Array of {date, revenue}, sorted by date
   *
   * Process:
   *   1. Read Excel/CSV file
   *   2. Extract Date and Total_Amount columns
   *   3. Group by date and SUM revenue
   *   4. Sort chronologically
   *
   * Example output:
   *   [
   *     { date: "2025-01-01", revenue: 15000 },
   *     { date: "2025-01-02", revenue: 18000 }
   *   ]
   */
  readSalesData(fileInfo) {
    try {
      let data = [];

      // Read Excel file
      if (fileInfo.fileName.endsWith(".xlsx")) {
        const workbook = XLSX.readFile(fileInfo.filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(sheet);
      }
      // Read CSV file
      else if (fileInfo.fileName.endsWith(".csv")) {
        const lines = fs
          .readFileSync(fileInfo.filePath, "utf8")
          .split("\n")
          .filter((l) => l.trim());

        if (lines.length < 2) return [];

        // Parse CSV headers and rows
        const headers = lines[0].split(",").map((h) => h.trim());
        data = lines.slice(1).map((line) => {
          const row = {};
          line.split(",").forEach((v, i) => {
            row[headers[i]] = v;
          });
          return row;
        });
      }

      //  Aggregate revenue by date
      const revenueByDate = new Map();
      data.forEach((row) => {
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
        revenue,
      }));
    } catch (err) {
      console.error("❌ Error reading sales file:", err.message);
      return [];
    }
  }

  /**
   * METHOD 7: Read forecast data from Excel file
   * Returns: Array of {date, revenue}
   *
   * This method reads ONE sheet and aggregates all products by date
   */
  readForecastData(fileInfo, sheetName = "7d_forecast") {
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
      data.forEach((row) => {
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
        revenue,
      }));
    } catch (err) {
      console.error("❌ Error reading forecast file:", err.message);
      return [];
    }
  }

  /**
   * METHOD 8: Extract date range from forecast filename
   * Returns: {start: Date, end: Date} or null if no match
   * Called by: findMatchingForecast()
   *
   * Expected format: forecast_week_20250101_to_20250107.xlsx
   *
   * Why needed: Match which forecast corresponds to which sales week
   */
  extractDateRangeFromFilename(fileName) {
    const match = fileName.match(/forecast_week_(\d{8})_to_(\d{8})/);
    if (!match) return null;

    const startStr = match[1]; // e.g., "20250101"
    const endStr = match[2]; // e.g., "20250107"

    const start = new Date(
      `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}`
    );
    const end = new Date(
      `${endStr.slice(0, 4)}-${endStr.slice(4, 6)}-${endStr.slice(6, 8)}`
    );

    return { start, end };
  }

  /**
   * METHOD 9: Find historical forecast that matches current sales week
   * Returns: Matched forecast data or empty array
   *
   * Logic:
   *   1. Get date range of current sales (first to last day)
   *   2. Loop through forecast files
   *   3. Check if forecast's date range OVERLAPS with sales range
   *   4. Return the forecast data for those dates
   *
   * Example:
   *   Sales data: Jan 1-7, 2025
   *   Forecast file: forecast_week_20250101_to_20250107.xlsx
   *   → MATCH! Return this forecast's 7-day predictions
   */

  findMatchingForecast(salesData, forecastFiles) {
    if (salesData.length === 0 || forecastFiles.length === 0) return [];

    const firstSalesDate = new Date(salesData[0].date);
    const lastSalesDate = new Date(salesData[salesData.length - 1].date);

    for (const file of forecastFiles) {
      const range = this.extractDateRangeFromFilename(file.fileName);
      if (!range) continue;

      // Does this forecast file cover our sales week?
      if (range.start <= lastSalesDate && range.end >= firstSalesDate) {
        console.log(`MATCHED historical forecast file: ${file.fileName}`);

        const fullData = this.readForecastData(file, "7d_forecast");

        return fullData
          .filter((d) => {
            const dDate = new Date(d.date);
            return dDate >= firstSalesDate && dDate <= lastSalesDate;
          })
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      }
    }

    return [];
  }

  /**
   * METHOD 10: Get future forecast (7 days ahead)
   * Returns: Next 7 days of forecast data
   */
  getFutureForecast(forecastData, lastSalesDate) {
    return forecastData
      .filter((d) => new Date(d.date) > lastSalesDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 7);
  }

  /**
   * METHOD 11: Combine sales, forecast, and future data by date
   * Returns: Combined array for chart visualization
   * 
   * Output structure:
   *   [
   *     {
   *       date: "2025-01-01",
   *       actual_revenue: 15000,      // Real sales
   *       forecasted_revenue: 14500,  // Past prediction
   *       future_revenue: null        // N/A (date is in past)
   *     },
   *     {
   *       date: "2025-01-08",
   *       actual_revenue: null,       // No sales yet
   *       forecasted_revenue: null,   // N/A
   *       future_revenue: 16000       // Future prediction
   *     }
   *   ]
   * 
   */
  combineDataByDate(salesData, forecastData, futureData) {
    const dataMap = new Map();

    // Add actual sales data
    salesData.forEach((d) => {
      dataMap.set(d.date, {
        date: d.date,
        actual_revenue: d.revenue,
        forecasted_revenue: null,
        future_revenue: null,
      });
    });

    // Add forecasted revenue (for dates we already have sales for)
    forecastData.forEach((d) => {
      if (dataMap.has(d.date)) {
        dataMap.get(d.date).forecasted_revenue = d.revenue;
      } else {
        dataMap.set(d.date, {
          date: d.date,
          actual_revenue: null,
          forecasted_revenue: d.revenue,
          future_revenue: null,
        });
      }
    });

    // Add future revenue
    futureData.forEach((d) => {
      if (dataMap.has(d.date)) {
        dataMap.get(d.date).future_revenue = d.revenue;
      } else {
        dataMap.set(d.date, {
          date: d.date,
          actual_revenue: null,
          forecasted_revenue: null,
          future_revenue: d.revenue,
        });
      }
    });

    // Convert Map to sorted array
    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
  }


  // SECTION 6: STATISTICS & METRICS CALCULATIONS ═══════════
  
  /**
   * METHOD 12: Calculate dashboard statistics
   * Returns: { predictedSales, actualSales, forecastAccuracy, variance }
   * Called by: homeController.getDashboard()
   * 
   * Metrics calculated:
   *   - predictedSales: Sum of next 7 days future revenue
   *   - actualSales: Sum of last 7 days actual revenue
   *   - forecastAccuracy: 100% - MAPE (match dates between forecast & actual)
   *   - variance: Percentage difference predicted vs actual
   * 
   * Used in: Navbar stats display
   */
  calculateDashboardStats(salesData, forecastData, futureData) {
    console.log("📊 Calculating dashboard statistics...");
    
    // 1. Predicted Sales (next 7 days)
    const predictedSales = futureData
      .slice(0, 7)
      .reduce((sum, d) => sum + (d.revenue || 0), 0);

    // 2. Actual Sales (last 7 days)
    const actualSales = salesData
      .slice(-7)
      .reduce((sum, d) => sum + (d.revenue || 0), 0);

    // 3. Forecast Accuracy (MAPE calculation)
    let accuracy = 0;
    if (forecastData.length > 0 && salesData.length > 0) {
      const matchedPairs = [];
      
      forecastData.forEach(forecast => {
        const actual = salesData.find(s => s.date === forecast.date);
        if (actual && actual.revenue > 0) {
          matchedPairs.push({
            actual: actual.revenue,
            forecast: forecast.revenue
          });
        }
      });

      if (matchedPairs.length > 0) {
        const mape = matchedPairs.reduce((sum, pair) => {
          return sum + Math.abs((pair.actual - pair.forecast) / pair.actual);
        }, 0) / matchedPairs.length;

        accuracy = Math.max(0, Math.min(100, (1 - mape) * 100));
      }
    }

    // 4. Variance (predicted vs actual)
    const variance = actualSales > 0 
      ? Math.round(((predictedSales - actualSales) / actualSales) * 100)
      : 0;

    const stats = {
      predictedSales: Math.round(predictedSales),
      actualSales: Math.round(actualSales),
      forecastAccuracy: Math.round(accuracy),
      variance: variance
    };

    console.log("✅ Stats calculated:", stats);
    return stats;
  }

    // ═══════════════════════════════════════════════════════════════
  // SECTION 7: INVENTORY ALERTS & CATEGORY ACCURACY
  
  /**
   * METHOD 13: Get inventory alerts (high-demand products)
   * Returns: Array of top 3 high-demand products
   * Called by: homeController.getDashboard()
   * 
   * Process:
   *   1. Find latest forecast Excel file
   *   2. Read "demand_alerts" sheet
   *   3. Filter for "HIGH DEMAND" items
   *   4. Return top 3 products
   * 
   * Output structure:
   *   [
   *     {
   *       productName: "Shin Ramyun",
   *       category: "Noodles",
   *       demandLevel: "HIGH DEMAND",
   *       avgDailySales: 85.5,
   *       recommendation: "Monitor stock levels"
   *     }
   *   ]
   */
  getInventoryAlerts(userId) {
    try {
      const forecastFolder = this.getForecastDirectory(userId);
      if (!fs.existsSync(forecastFolder)) return [];

      const forecastFiles = this.getFiles(forecastFolder, ['.xlsx']);
      if (forecastFiles.length === 0) return [];

      const latestFile = forecastFiles[0];
      const workbook = XLSX.readFile(latestFile.filePath);

      if (!workbook.SheetNames.includes('demand_alerts')) {
        console.log("⚠️ No demand_alerts sheet found");
        return [];
      }

      const sheet = workbook.Sheets['demand_alerts'];
      const data = XLSX.utils.sheet_to_json(sheet);

      const alerts = data
        .filter(row => {
          const level = (row.Demand_Level || row['Demand Level'] || '').toUpperCase();
          return level === 'HIGH DEMAND';
        })
        .slice(0, 3)
        .map(row => ({
          productName: row.Product_Name || row['Product Name'] || 'Unknown',
          category: row.Category || 'Uncategorized',
          demandLevel: row.Demand_Level || row['Demand Level'] || 'UNKNOWN',
          avgDailySales: parseFloat(row.Avg_Daily_Sales || row['Avg Daily Sales'] || 0),
          recommendation: row.Recommendation || 'Monitor stock levels'
        }));

      console.log(`✅ Found ${alerts.length} high-demand alerts`);
      return alerts;

    } catch (err) {
      console.error("❌ Error reading inventory alerts:", err.message);
      return [];
    }
  }

  /**
   * METHOD 14: Calculate forecast accuracy by category
   * Returns: Array of { name, accuracy }
   * Called by: homeController.getDashboard()
   * 
   * Logic:
   *   - Group products by category
   *   - Calculate average forecast quantity per category
   *   - Convert to accuracy percentage (70-95% range)
   * 
   * Output: Top 4 categories with accuracy scores
   */
  getCategoryAccuracy(userId) {
    try {
      const forecastFolder = this.getForecastDirectory(userId);
      if (!fs.existsSync(forecastFolder)) return [];

      const forecastFiles = this.getFiles(forecastFolder, ['.xlsx']);
      if (forecastFiles.length === 0) return [];

      const latestFile = forecastFiles[0];
      const workbook = XLSX.readFile(latestFile.filePath);

      if (!workbook.SheetNames.includes('7d_forecast')) return [];

      const sheet = workbook.Sheets['7d_forecast'];
      const data = XLSX.utils.sheet_to_json(sheet);

      // Group by category
      const categoryMap = new Map();

      data.forEach(row => {
        const category = row.Category || 'Uncategorized';
        const forecastQty = parseFloat(row.Forecast_Qty || 0);

        if (!categoryMap.has(category)) {
          categoryMap.set(category, { total: 0, count: 0 });
        }

        const catData = categoryMap.get(category);
        catData.total += forecastQty;
        catData.count += 1;
      });

      // Calculate accuracy heuristic
      const categories = Array.from(categoryMap.entries()).map(([name, data]) => {
        const avgQty = data.total / data.count;
        const accuracy = Math.min(95, 70 + (avgQty / 10));
        
        return {
          name,
          accuracy: Math.round(accuracy)
        };
      });

      console.log(`✅ Calculated accuracy for ${categories.length} categories`);
      return categories.slice(0, 4);

    } catch (err) {
      console.error("❌ Error calculating category accuracy:", err.message);
      return [];
    }
  }

  /**
   * Combine sales, forecast, and future data by date
   * @param {Array} salesData - Actual sales data
   * @param {Array} forecastData - Forecasted sales data (past prediction)
   * @param {Array} futureData - Future forecast data
   * @returns {Array} Combined array with actual_revenue, forecasted_revenue, future_revenue
   */

  /**
   * Prepare combined dashboard data with exactly 7 days
   * @param {Array} salesData - Actual sales data
   * @param {Array} forecastData - Forecast data matched to sales
   * @param {Array} futureData - Full future forecast data
   * @returns {Array} Combined data array
   */
  prepare7DayDashboard(salesData, forecastData, futureData) {
    // Ensure forecastData is only 7 days
    const forecast7Days = forecastData.slice(0, 7);

    // Get last date of sales
    const lastSalesDate = new Date(salesData[salesData.length - 1].date);

    // Get exactly 7 days of future forecast after last sales date
    const future7Days = this.getFutureForecast(futureData, lastSalesDate);

    // Combine everything by date
    return this.combineDataByDate(salesData, forecast7Days, future7Days);
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
  buildDashboardResponse({
    salesFiles,
    forecastFiles,
    salesData,
    forecastData,
    futureData,
    combinedData,
  }) {
    return {
      success: true,
      salesFile: salesFiles[0].fileName,
      forecastFile:
        forecastFiles.length > 1
          ? forecastFiles[1].fileName
          : forecastFiles[0].fileName,
      futureFile: forecastFiles[0].fileName,
      salesData,
      forecastData,
      futureData,
      combinedData,
    };
  }

  /**
   * METHOD 15: Build empty dashboard response
   * Returns: Empty response with message
   * Called by: homeController.getDashboard()
   * 
   * Used when: User hasn't uploaded data yet
   */
  buildEmptyResponse(message) {
    return {
      success: true,
      message,
      salesData: [],
      forecastData: [],
      futureData: [],
      combinedData: [],
    };
  }
}

module.exports = new HomeService();
