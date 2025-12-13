// backend/controllers/homeController.js
/**
 * ═══════════════════════════════════════════════════════════════
 * HOME CONTROLLER - Dashboard Data Orchestrator
 * ═══════════════════════════════════════════════════════════════
 */

const homeService = require("../services/homeService");
const { fetchForecastFromPython } = require("../services/pythonClient");
const fs = require("fs");
const path = require("path");

class HomeController {
  /**
   * Get the latest evaluation JSON for a user
   * Returns evaluation data with evaluation_date and per-horizon metrics
   */
  getLatestEvaluation(userId) {
    try {
      const evalDir = path.join(__dirname, "../files", "forecastData", `user_${userId}`, "..", "..", "reports", "evaluation", `user_${userId}`);
      // Better path
      const evalDir2 = path.join(__dirname, "../../ml-service/reports/evaluation", `user_${userId}`);
      
      let searchDir = null;
      if (fs.existsSync(evalDir2)) {
        searchDir = evalDir2;
      } else if (fs.existsSync(evalDir)) {
        searchDir = evalDir;
      }
      
      if (!searchDir || !fs.existsSync(searchDir)) {
        console.log(`   ℹ️ No evaluation directory found for user ${userId}`);
        return null;
      }
      
      // Find latest evaluation JSON
      const evaluationFiles = fs
        .readdirSync(searchDir)
        .filter(f => f.startsWith("evaluation_") && f.endsWith(".json"))
        .sort((a, b) => {
          const timeA = fs.statSync(path.join(searchDir, a)).mtime;
          const timeB = fs.statSync(path.join(searchDir, b)).mtime;
          return timeB - timeA; // Newest first
        });
      
      if (!evaluationFiles.length) {
        console.log(`   ℹ️ No evaluation JSON files found`);
        return null;
      }
      
      const latestEval = evaluationFiles[0];
      const evalPath = path.join(searchDir, latestEval);
      
      const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
      console.log(`   ✅ Loaded evaluation: ${latestEval}`);
      return evalData;
    } catch (err) {
      console.error(`   ⚠️ Failed to load evaluation: ${err.message}`);
      return null;
    }
  }
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
      const latestForecastFile = [...forecastFiles].sort((a, b) => {
        const rangeA = homeService.extractDateRangeFromFilename(a.fileName);
        const rangeB = homeService.extractDateRangeFromFilename(b.fileName);
        if (!rangeA) return 1;
        if (!rangeB) return -1;
        return rangeB.start - rangeA.start;
      })[0];

      console.log(`\n📈 Using forecast file: ${latestForecastFile.fileName}`);

      // STEP 7: Determine if we should include historical forecast for accuracy comparison
      // Only include if there's an OLDER forecast (not the latest one)
      // This allows accuracy comparison: Week 2 actuals vs Week 1 forecast
      // On first upload (Week 1), there's no older forecast, so forecasted = []
      let forecastData = [];
      
      if (forecastFiles.length > 1) {
        // Use the SECOND newest (previous week's forecast), not the latest
        const olderForecastFiles = forecastFiles.slice(1); // All except the newest
        console.log(`\n📅 Found ${olderForecastFiles.length} older forecast(s) for accuracy comparison`);
        forecastData = homeService.getHistoricalForecastByDays(
          olderForecastFiles,
          lastSalesDate,
          7
        );
      } else {
        console.log(`\n📅 No older forecast available (first upload) - skipping forecasted line`);
        forecastData = [];
      }
      
      // Get future forecast
      const futureData = homeService.getFutureForecastByDays(
        latestForecastFile,
        lastSalesDate,
        days
      );

      // STEP 6: Rebuild combined data with ONLY the appropriate forecast data
      // This ensures first upload has NO forecasted line, and subsequent uploads show accuracy comparison
      const combinedData = homeService.combineDataByDate(
        salesData,
        forecastData, // Empty on first upload, older forecast on subsequent uploads
        futureData
      );
      console.log(`   Combined: ${combinedData.length} total data points`);

      // STEP 8: Fetch Python forecast results (REQUIRED - no file-based fallback)
      console.log("\n🐍 Fetching forecast from ML models (forecastModel.py)...");
      const pythonForecast = await fetchForecastFromPython(userId);

      if (!pythonForecast || pythonForecast.status !== "success") {
        console.error("\n❌ CRITICAL: Python API forecast is required but unavailable!");
        console.error("   Make sure main_app.py is running: python -m uvicorn main_app:app --reload --host 0.0.0.0 --port 8000");
        return res.status(503).json({
          success: false,
          error: "Forecast service unavailable",
          message: "Python API (main_app.py) must be running on port 8000. Start it with: python -m uvicorn main_app:app --reload --host 0.0.0.0 --port 8000",
          statusCode: 503
        });
      }

      // STEP 9: Extract stats from Python ML forecast
      console.log("\n📊 Extracting ML forecast statistics...");
      let predictedSales = 0;
      let actualSales = 0;
      let forecastAccuracy = 0;
      let inventoryAlerts = [];
      
      // Calculate actual sales from current sales data
      actualSales = salesData.reduce((sum, d) => sum + (d.revenue || 0), 0);
      console.log(`   ✅ Actual Sales (7d): ₱${Math.round(actualSales).toLocaleString()}`);
      
      // Load evaluation JSON first (most accurate source for MAPE)
      console.log("\n📋 Loading evaluation metrics...");
      const evaluationData = this.getLatestEvaluation(userId);
      
      // Try to load latest aggregated metrics from weekly pipeline
      console.log("📋 Loading aggregated metrics from weekly pipeline...");
      const WeeklyForecastService = require("../services/weeklyForecastService");
      const cachedMetrics = await WeeklyForecastService.getLatestMetrics(userId);
      
      // Forecast Accuracy: Prioritize evaluation JSON over cached metrics
      if (evaluationData && evaluationData.horizons && evaluationData.horizons["7"]) {
        const eval7d = evaluationData.horizons["7"];
        if (eval7d.status === "evaluated" && eval7d.metrics && eval7d.metrics.MAPE !== null) {
          const mape = eval7d.metrics.MAPE;
          forecastAccuracy = Math.round(100 - mape);
          const evalDate = evaluationData.evaluation_date 
            ? new Date(evaluationData.evaluation_date).toISOString().split("T")[0]
            : "N/A";
          console.log(`   ✅ Forecast Accuracy from evaluation JSON: ${forecastAccuracy}% (MAPE: ${mape}%, evaluated ${evalDate})`);
        }
      } else if (cachedMetrics && cachedMetrics.forecast_accuracy_7d && cachedMetrics.forecast_accuracy_7d.MAPE !== null) {
        // Fallback to cached metrics
        forecastAccuracy = Math.round(100 - cachedMetrics.forecast_accuracy_7d.MAPE);
        console.log(`   ✅ Forecast Accuracy from cached metrics: ${forecastAccuracy}% (MAPE: ${cachedMetrics.forecast_accuracy_7d.MAPE}%)`);
      } else {
        console.log(`   ⚠️ No evaluation data available yet`);
        forecastAccuracy = 0;
      }
      
      // Predicted Sales: Use cached metrics if available, otherwise calculate from Python forecast
      if (cachedMetrics && cachedMetrics.predicted_sales_7d) {
        predictedSales = cachedMetrics.predicted_sales_7d;
        console.log(`   ✅ Predicted Sales from cached metrics: ₱${Math.round(predictedSales).toLocaleString()}`);
      } else {
        // Calculate from Python forecast
        const forecastsFor7d = (pythonForecast.forecasts && (pythonForecast.forecasts["7d_forecast"] || pythonForecast.forecasts["7"])) || [];
        if (Array.isArray(forecastsFor7d) && forecastsFor7d.length > 0) {
          predictedSales = forecastsFor7d.reduce((sum, f) => sum + (f.Revenue_Estimate || 0), 0);
          console.log(`   ✅ Predicted Sales from Python forecast: ₱${Math.round(predictedSales).toLocaleString()}`);
        }
      }
      
      // Inventory Alerts: Use cached metrics if available, otherwise from Python forecast
      if (cachedMetrics && cachedMetrics.inventory_alerts && cachedMetrics.inventory_alerts.length > 0) {
        inventoryAlerts = cachedMetrics.inventory_alerts
          .map(a => ({
            productName: a.product_name,
            avgDailySales: a.avg_daily_sales,
            category: a.category,
            demandLevel: a.demand_level,
            recommendation: a.recommendation
          }));
        console.log(`   ✅ Inventory alerts from cached metrics: ${inventoryAlerts.length}`);
      } else if (pythonForecast.demand_levels && pythonForecast.demand_levels.length > 0) {
        inventoryAlerts = pythonForecast.demand_levels
          .filter(d => d.Demand_Level === "HIGH DEMAND")
          .map(d => ({
            productName: d.Product_Name,
            avgDailySales: Math.round(d.Avg_Daily_Sales),
            category: d.Category,
            demandLevel: d.Demand_Level,
            recommendation: d.Recommendation,
          }))
          .slice(0, 5); // Top 5 alerts
        console.log(`   ✅ Inventory alerts from Python forecast: ${inventoryAlerts.length}`);
      }

      // Build evaluation summary: Prioritize evaluation JSON over cached metrics
      const evaluationSummary = {};
      
      if (evaluationData && evaluationData.horizons) {
        // Use evaluation JSON (most accurate source)
        ["7", "30", "90"].forEach(h => {
          const ev = evaluationData.horizons[h];
          if (ev && ev.status === "evaluated" && ev.metrics) {
            evaluationSummary[h] = {
              RMSE: ev.metrics.RMSE,
              MAE: ev.metrics.MAE,
              MAPE: ev.metrics.MAPE,
              records: ev.records || 0,
              evaluation_date: evaluationData.evaluation_date
            };
          }
        });
        console.log(`   ✅ Evaluation summary loaded from evaluation JSON (MAPE for 7d: ${evaluationSummary["7"]?.MAPE || "N/A"}%)`);
      } else if (cachedMetrics && cachedMetrics.forecast_accuracy_7d) {
        // Fallback to cached metrics from weekly pipeline
        evaluationSummary["7"] = {
          RMSE: cachedMetrics.forecast_accuracy_7d.RMSE,
          MAE: cachedMetrics.forecast_accuracy_7d.MAE,
          MAPE: cachedMetrics.forecast_accuracy_7d.MAPE,
          records: cachedMetrics.forecast_accuracy_7d.records || 0,
          evaluation_date: cachedMetrics.evaluation_date
        };
        console.log(`   ✅ Evaluation summary loaded from cached metrics (MAPE: ${cachedMetrics.forecast_accuracy_7d.MAPE}%)`);
      }

      // Calculate variance (predicted vs actual)
      const variance = actualSales > 0 
        ? Math.round(((predictedSales - actualSales) / actualSales) * 100)
        : 0;

      // STEP 10: Build complete response with ML-based data
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

        // Stats from ML models
        stats: {
          predictedSales: Math.round(predictedSales),
          actualSales: Math.round(actualSales),
          forecastAccuracy: forecastAccuracy,
          variance: variance,
          evaluationSummary: evaluationSummary
        },

        // Inventory Alerts from ML
        inventoryAlerts: inventoryAlerts,

        // Category Accuracy (from ML if available)
        categoryAccuracy: pythonForecast.category_accuracy || [],

        // Python ML Forecast (full data)
        pythonForecast: pythonForecast,
      }

      console.log("\n" + "=".repeat(70));
      console.log(
        `✅ DASHBOARD DATA READY (${days}-day future forecast) - Sending response`
      );
      console.log("=".repeat(70) + "\n");

      res.json(response);
    } catch (err) {
      console.error("\n" + "=".repeat(70));
      console.error("❌ DASHBOARD ERROR:");
      console.error("=".repeat(70));
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
      console.error("=".repeat(70) + "\n");

      res.status(500).json({
        success: false,
        error: "Server error",
        details: err.message,
      });
    }
  }
}

module.exports = new HomeController();
