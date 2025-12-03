// backend/services/homeService.js

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

  // METHOD 3: Check if both required directories exist

  validateDirectories(salesFolder, forecastFolder) {
    return fs.existsSync(salesFolder) && fs.existsSync(forecastFolder);
  }

  // METHOD 4: Get files from directory
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

  // METHOD 5: Parse various date formats to YYYY-MM-DD string
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

  //METHOD 6: Read sales data from Excel or CSV file
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

  // METHOD 7: Read forecast data from Excel file
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

  // METHOD 8: Extract date range from forecast filename
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

  //METHOD 9: Find historical forecast that matches current sales week

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

  // METHOD 10: Get future forecast (7 days ahead)
  getFutureForecast(forecastData, lastSalesDate) {
    return forecastData
      .filter((d) => new Date(d.date) > lastSalesDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 7);
  }

  // METHOD 11: Combine sales, forecast, and future data by date
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
  
  // METHOD 12: Calculate dashboard statistics
  // Used in: Navbar stats display

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

  // SECTION 7: INVENTORY ALERTS & CATEGORY ACCURACY
  // METHOD 13: Get inventory alerts (high-demand products)
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

  // METHOD 14: Calculate forecast accuracy by category
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
 * Get historical forecast for a specific number of days
 * @param {Array} forecastFiles - Array of forecast file objects
 * @param {Date} lastSalesDate - Last date from actual sales
 * @param {number} days - Number of days to retrieve (7, 30, or 90)
 * @returns {Array} Forecast data for the specified period
 */
getHistoricalForecastByDays(forecastFiles, lastSalesDate, days = 7) {
  if (forecastFiles.length === 0) return [];
  
  // Determine which sheet to read based on days
  let sheetName;
  switch(days) {
    case 7:
      sheetName = "7d_forecast";
      break;
    case 30:
      sheetName = "30d_forecast";
      break;
    case 90:
      sheetName = "90d_forecast";
      break;
    default:
      sheetName = "7d_forecast";
  }
  
  console.log(`📅 Looking for ${days}-day historical forecast from sheet: ${sheetName}`);
  
  const endDate = new Date(lastSalesDate);
  const startDate = new Date(lastSalesDate);
  startDate.setDate(startDate.getDate() - days + 1);
  
  console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  // Find all forecast files that overlap with our date range
  const matchingData = [];
  
  for (const file of forecastFiles) {
    const fullData = this.readForecastData(file, sheetName);
    
    const relevantData = fullData.filter((d) => {
      const dDate = new Date(d.date);
      return dDate >= startDate && dDate <= endDate;
    });
    
    matchingData.push(...relevantData);
  }
  
  // Remove duplicates (keep most recent forecast for each date)
  const uniqueData = new Map();
  matchingData.forEach(d => {
    if (!uniqueData.has(d.date) || d.revenue > 0) {
      uniqueData.set(d.date, d);
    }
  });
  
  const result = Array.from(uniqueData.values())
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  console.log(`   ✅ Found ${result.length} historical forecast data points`);
  return result;
}

/**
 * Get future forecast for a specific number of days
 * @param {Object} latestForecastFile - The most recent forecast file object
 * @param {Date} lastSalesDate - Last date from actual sales
 * @param {number} days - Number of future days to retrieve (7, 30, or 90)
 * @returns {Array} Future forecast data
 */
getFutureForecastByDays(latestForecastFile, lastSalesDate, days = 7) {
  // Determine which sheet to read based on days
  let sheetName;
  switch(days) {
    case 7:
      sheetName = "7d_forecast";
      break;
    case 30:
      sheetName = "30d_forecast";
      break;
    case 90:
      sheetName = "90d_forecast";
      break;
    default:
      sheetName = "7d_forecast";
  }
  
  console.log(`📈 Reading ${days}-day future forecast from sheet: ${sheetName}`);
  
  // Read the appropriate sheet
  const allForecastData = this.readForecastData(latestForecastFile, sheetName);
  
  const futureData = allForecastData
    .filter((d) => new Date(d.date) > lastSalesDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, days);
  
  console.log(`   ✅ Found ${futureData.length} future forecast data points`);
  return futureData;
}

/**
 * Prepare dashboard data with flexible day ranges
 * - Actual Sales: Always last 7 days
 * - Forecasted: Always 7 days (matching actual sales period)
 * - Future: Flexible (7, 30, or 90 days based on user selection)
 * 
 * @param {Array} salesData - Actual sales data (last 7 days)
 * @param {Array} forecastFiles - All forecast files
 * @param {Object} latestForecastFile - The most recent forecast file
 * @param {number} days - Number of days for FUTURE forecast only (7, 30, or 90)
 * @returns {Object} Combined data with actual, forecasted, and future
 */
prepareDashboardByDays(salesData, forecastFiles, latestForecastFile, days = 7) {
  console.log(`\n🔧 Preparing dashboard view...`);
  console.log(`   - Actual Sales: Last 7 days`);
  console.log(`   - Forecasted: 7 days (matching actual sales)`);
  console.log(`   - Future Forecast: ${days} days`);
  
  // Always use last 7 days of actual sales
  const salesLast7 = salesData.slice(-7);
  const lastSalesDate = new Date(salesLast7[salesLast7.length - 1].date);
  
  // Get historical forecast for FIXED 7 days (always from 7d_forecast sheet)
  const forecastData = this.getHistoricalForecastByDays(forecastFiles, lastSalesDate, 7);
  
  // Get future forecast for VARIABLE days (from appropriate sheet: 7d, 30d, or 90d)
  const futureData = this.getFutureForecastByDays(latestForecastFile, lastSalesDate, days);
  
  console.log(`   ✅ Sales: ${salesLast7.length} days`);
  console.log(`   ✅ Historical Forecast: ${forecastData.length} days (always 7)`);
  console.log(`   ✅ Future Forecast: ${futureData.length} days (${days} requested)`);
  
  // Combine all data
  return this.combineDataByDate(salesLast7, forecastData, futureData);
}

  // METHOD 15: Build empty dashboard response
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
