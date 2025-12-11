// backend/controllers/homeController.js
/**
 * ═══════════════════════════════════════════════════════════════
 * HOME CONTROLLER - Dashboard Data Orchestrator
 * ═══════════════════════════════════════════════════════════════
 */

const homeService = require("../services/homeService");
const { fetchForecastFromPython } = require("../services/pythonClient");

class HomeController {
  async getDashboard(req, res) {
    try {
      console.log("\n" + "=" * 70);
      console.log("📊 DASHBOARD REQUEST RECEIVED");
      console.log("=" * 70);

      // Get the 'days' parameter from query string (default to 7)
      const requestedDays = parseInt(req.query.days) || 7;
      const validDays = [7, 30, 90];
      const days = validDays.includes(requestedDays) ? requestedDays : 7;

      console.log(`📅 Requested view: ${days} days (for future forecast only)`);

      // STEP 1: Authentication check
      const userId = req.session.user?.id;
      if (!userId) {
        console.log("❌ Unauthorized: No user ID in session");
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }
      console.log(`✅ User authenticated: ${userId}`);

      // STEP 2: Validate directories exist
      const salesFolder = homeService.getSalesDirectory(userId);
      const forecastFolder = homeService.getForecastDirectory(userId);

      if (!homeService.validateDirectories(salesFolder, forecastFolder)) {
        console.log("⚠️ Missing directories - returning empty response");
        return res.json(
          homeService.buildEmptyResponse(
            "No data available yet. Please upload sales data and generate forecasts."
          )
        );
      }
      console.log("✅ Directories validated");

      // STEP 3: Get file lists (newest first)
      const salesFiles = homeService.getFiles(salesFolder);
      const forecastFiles = homeService.getFiles(forecastFolder, [".xlsx"]);

      if (!salesFiles.length || !forecastFiles.length) {
        console.log("⚠️ No files found - returning empty response");
        return res.json(
          homeService.buildEmptyResponse(
            "Please upload sales data and generate forecasts."
          )
        );
      }
      console.log(
        `✅ Found ${salesFiles.length} sales files, ${forecastFiles.length} forecast files`
      );

      // STEP 4: Read actual sales data (always last 7 days)
      console.log(`\n📖 Reading sales from: ${salesFiles[0].fileName}`);
      const allSalesData = homeService.readSalesData(salesFiles[0]);

      if (allSalesData.length === 0) {
        console.log("⚠️ No valid sales data");
        return res.json(
          homeService.buildEmptyResponse("No valid sales data found.")
        );
      }

      // Always use last 7 days of sales
      const salesData = allSalesData.slice(-7);
      console.log(`✅ Using last ${salesData.length} days of sales data`);

      const lastSalesDate = new Date(salesData[salesData.length - 1].date);
      const firstSalesDate = new Date(salesData[0].date);
      console.log(
        `   Date range: ${firstSalesDate.toISOString().split("T")[0]} to ${
          lastSalesDate.toISOString().split("T")[0]
        }`
      );

      // STEP 5: Get latest future forecast file
      const latestForecastFile = [...forecastFiles].sort((a, b) => {
        const rangeA = homeService.extractDateRangeFromFilename(a.fileName);
        const rangeB = homeService.extractDateRangeFromFilename(b.fileName);
        if (!rangeA) return 1;
        if (!rangeB) return -1;
        return rangeB.start - rangeA.start;
      })[0];

      console.log(`\n📈 Using forecast file: ${latestForecastFile.fileName}`);

      // STEP 6: Prepare data with flexible future forecast but fixed 7-day historical
      const combinedData = homeService.prepareDashboardByDays(
        allSalesData,
        forecastFiles,
        latestForecastFile,
        days // This now only affects future forecast
      );
      console.log(`   Combined: ${combinedData.length} total data points`);

      // STEP 7: Calculate dashboard statistics (always based on last 7 days)
      const forecastData = homeService.getHistoricalForecastByDays(
        forecastFiles,
        lastSalesDate,
        7
      );
      const futureData = homeService.getFutureForecastByDays(
        latestForecastFile,
        lastSalesDate,
        days
      );

      console.log("\n📊 Calculating statistics...");
      const stats = homeService.calculateDashboardStats(
        salesData,
        forecastData,
        futureData
      );
      console.log("   Stats:", stats);

      // STEP 8: Get inventory alerts
      console.log("\n🚨 Fetching inventory alerts...");
      const inventoryAlerts = homeService.getInventoryAlerts(userId);
      console.log(`   Alerts found: ${inventoryAlerts.length}`);

      // STEP 9: Get category accuracy
      console.log("\n📈 Calculating category accuracy...");
      const categoryAccuracy = homeService.getCategoryAccuracy(userId);
      console.log(`   Categories: ${categoryAccuracy.length}`);

      // STEP 10: Build complete response
      const response = {
        success: true,
        days: days, // The day range that affects future forecast

        // File info
        salesFile: salesFiles[0].fileName,
        forecastFile:
          forecastFiles.length > 0 ? forecastFiles[0].fileName : "N/A",
        futureFile: latestForecastFile.fileName,

        // Chart data
        combinedData: combinedData,

        // Stats (always based on 7 days)
        stats: {
          predictedSales: stats.predictedSales || 0,
          actualSales: stats.actualSales || 0,
          forecastAccuracy: stats.forecastAccuracy || 0,
          variance: stats.variance || 0,
        },

        // Inventory Alerts
        inventoryAlerts: inventoryAlerts.map((alert) => ({
          productName: alert.productName,
          avgDailySales: alert.avgDailySales,
          category: alert.category,
          demandLevel: alert.demandLevel,
          recommendation: alert.recommendation,
        })),

        // Category Accuracy
        categoryAccuracy: categoryAccuracy.map((cat) => ({
          name: cat.name,
          accuracy: cat.accuracy,
        })),
      };

      console.log("\n" + "=" * 70);
      console.log(
        `✅ DASHBOARD DATA READY (${days}-day future forecast) - Sending response`
      );
      console.log("=" * 70 + "\n");

      res.json(response);
    } catch (err) {
      console.error("\n" + "=" * 70);
      console.error("❌ DASHBOARD ERROR:");
      console.error("=" * 70);
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
      console.error("=" * 70 + "\n");

      res.status(500).json({
        success: false,
        error: "Server error",
        details: err.message,
      });
    }



    // ==============================
    // Fetch Python forecast
    // ==============================
    const pythonForecast = await fetchForecastFromPython(userId);

    if (pythonForecast) {
      console.log("✅ Fetched Python Forecast for Dashboard");

      // Inject into dashboard response
      response.pythonForecast = pythonForecast;

      // Override navbar stats with ML results
      response.stats.predictedSales = pythonForecast.total_predicted_7d;
      response.stats.forecastAccuracy = pythonForecast.overall_mape
        ? Math.round(100 - pythonForecast.overall_mape)
        : response.stats.forecastAccuracy;

      // Inject demand alerts from Python
      response.inventoryAlerts = pythonForecast.demand_alerts || [];
    }
  }
}

module.exports = new HomeController();
