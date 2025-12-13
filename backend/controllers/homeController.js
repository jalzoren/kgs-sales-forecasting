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
   * Parse date from various formats (DD/MM/YYYY, YYYY-MM-DD, Date object, Excel numeric)
   */
  parseAnyDate(input) {
    if (!input) return null;

    // Already a Date object
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    // String parsing
    if (typeof input === "string") {
      // Try YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const date = new Date(input + "T00:00:00Z");
        return !isNaN(date.getTime()) ? date : null;
      }

      // Try DD/MM/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
        const [day, month, year] = input.split("/");
        const date = new Date(year, month - 1, day);
        return !isNaN(date.getTime()) ? date : null;
      }

      // Try parsing as standard date string
      const date = new Date(input);
      return !isNaN(date.getTime()) ? date : null;
    }

    // Excel numeric (days since 1900-01-01, but Excel has a bug where it counts 1900 as leap year)
    if (typeof input === "number" && input > 0) {
      // Excel serial date: days since 1900-01-01 (with a leap year bug)
      // Serial 1 = 1900-01-01, Serial 60 = 1900-02-29 (bug), Serial 61 = 1900-03-01
      const excelEpoch = new Date(1900, 0, 1);
      const date = new Date(excelEpoch.getTime() + (input - 1) * 24 * 60 * 60 * 1000);
      
      // Adjust for Excel's leap year bug (dates after Feb 28, 1900)
      if (input > 59) {
        date.setDate(date.getDate() + 1);
      }

      return !isNaN(date.getTime()) ? date : null;
    }

    return null;
  }

  /**
   * Format date to YYYY/MM/DD format
   */
  formatDate(date) {
    if (!date) return "N/A";
    
    const d = this.parseAnyDate(date);
    if (!d) return "N/A";
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    
    return `${year}/${month}/${day}`;
  }

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

      // STEP 9: Build NEW wMAPE-based metrics structure from forecast JSON
      console.log("\n📊 Building wMAPE-based metrics from forecast JSON...");
      
      // Extract actual sales dates and total
      const actualSalesTotal = salesData.reduce((sum, d) => sum + (d.revenue || d.Total_Sales || 0), 0);
      const salesDates = salesData.map((d) => this.parseAnyDate(d.date || d.Date)).filter(Boolean).sort((a, b) => a - b);
      
      const actualSalesLabel = salesDates.length > 0 
        ? `Sales Data ${this.formatDate(salesDates[0])} – ${this.formatDate(salesDates[salesDates.length - 1])}`
        : "Sales Data N/A";
      
      console.log(`   ✅ Actual Sales: ₱${Math.round(actualSalesTotal).toLocaleString()} (${actualSalesLabel})`);

      // Extract predicted sales from forecast JSON with date ranges
      const metrics = {
        predicted_sales: {
          "7": { label: "", total: 0, start_date: null, end_date: null },
          "30": { label: "", total: 0, start_date: null, end_date: null },
          "90": { label: "", total: 0, start_date: null, end_date: null }
        },
        actual_sales: {
          label: actualSalesLabel,
          total: actualSalesTotal,
          start_date: salesDates.length > 0 ? this.formatDate(salesDates[0]) : null,
          end_date: salesDates.length > 0 ? this.formatDate(salesDates[salesDates.length - 1]) : null
        },
        forecast_accuracy: {
          "7": { status: "not_available", reason: "No previous forecast evaluation available yet." },
          "30": { status: "not_available", reason: "No previous forecast evaluation available yet." },
          "90": { status: "not_available", reason: "No previous forecast evaluation available yet." }
        },
        inventory_alerts: { alert_count: 0, products: [] }
      };

      // Extract predicted sales for each horizon from forecast JSON
      if (pythonForecast.forecasts) {
        const horizons = ["7", "30", "90"];
        for (const h of horizons) {
          const key = h;
          const forecastData = pythonForecast.forecasts[key] || [];
          
          console.log(`[DEBUG] Checking forecast data for horizon ${h}: ${Array.isArray(forecastData) ? forecastData.length : "NOT_ARRAY"} records`);
          
          if (Array.isArray(forecastData) && forecastData.length > 0) {
            const totalRevenue = forecastData.reduce((sum, f) => sum + (f.Revenue_Estimate || 0), 0);
            const forecastDates = forecastData
              .map((f) => this.parseAnyDate(f.Date))
              .filter(Boolean)
              .sort((a, b) => a - b);
            
            if (forecastDates.length > 0) {
              const startDate = this.formatDate(forecastDates[0]);
              const endDate = this.formatDate(forecastDates[forecastDates.length - 1]);
              metrics.predicted_sales[h].label = `Forecasting ${startDate} – ${endDate}`;
              metrics.predicted_sales[h].total = totalRevenue;
              metrics.predicted_sales[h].start_date = startDate;
              metrics.predicted_sales[h].end_date = endDate;
              
              console.log(`   ✅ Predicted Sales (${h}d): ₱${Math.round(totalRevenue).toLocaleString()} (${startDate} to ${endDate})`);
            } else {
              console.log(`   ⚠️ No valid dates found in forecast data for horizon ${h}d`);
            }
          } else {
            // Fallback: Try to use forecast_period from pythonForecast if available
            if (pythonForecast.forecast_period && h === "7") {
              const start = pythonForecast.forecast_period.start;
              const end = pythonForecast.forecast_period.end_7d;
              if (start && end) {
                metrics.predicted_sales[h].label = `Forecasting ${start.replace(/-/g, "/")} – ${end.replace(/-/g, "/")}`;
                console.log(`   ℹ️ Using forecast_period for ${h}d: ${metrics.predicted_sales[h].label}`);
              }
            }
          }
        }
      } else {
        console.log(`   ⚠️ No forecasts found in pythonForecast`);
      }

      // Extract inventory alerts from demand_levels (HIGH DEMAND products only)
      if (pythonForecast.demand_levels && Array.isArray(pythonForecast.demand_levels)) {
        const highDemandProducts = pythonForecast.demand_levels
          .filter(d => d.Demand_Level === "HIGH DEMAND")
          .map(d => ({
            product_id: d.Product_ID,
            product_name: d.Product_Name,
            category: d.Category,
            demand_level: d.Demand_Level,
            avg_daily_sales: d.Avg_Daily_Sales,
            recommendation: d.Recommendation
          }));
        
        metrics.inventory_alerts.alert_count = highDemandProducts.length;
        metrics.inventory_alerts.products = highDemandProducts;
        
        console.log(`   ✅ Inventory Alerts (HIGH DEMAND): ${highDemandProducts.length} products`);
      }

      // Load evaluation JSON for forecast accuracy (only if available)
      console.log("\n📋 Loading forecast accuracy from evaluation data...");
      const evaluationData = this.getLatestEvaluation(userId);
      
      if (evaluationData && evaluationData.horizons) {
        // STRICT RULE: Only evaluate if evaluation data exists (which means a previous forecast was evaluated)
        for (const horizon of ["7", "30", "90"]) {
          const evalHorizon = evaluationData.horizons[horizon];
          
          if (evalHorizon && evalHorizon.status === "evaluated" && evalHorizon.metrics) {
            // Calculate wMAPE: ABS(actual - forecast) / actual
            // Accuracy = (1 - wMAPE) × 100
            const mape = evalHorizon.metrics.MAPE || 0;
            const wmape = mape / 100; // Convert MAPE percentage to decimal
            const accuracyPercent = Math.round((1 - wmape) * 100 * 100) / 100; // 2 decimals
            
            metrics.forecast_accuracy[horizon] = {
              status: "available",
              accuracy_percent: accuracyPercent,
              wmape: Math.round(wmape * 10000) / 100, // Convert to percentage
              forecasted_on: pythonForecast.forecast_period?.start || "N/A",
              evaluated_on: evaluationData.evaluation_date 
                ? new Date(evaluationData.evaluation_date).toISOString().split("T")[0]
                : "N/A",
              reason: null
            };
            
            console.log(`   ✅ Forecast Accuracy (${horizon}d): ${accuracyPercent}% (wMAPE: ${Math.round(wmape * 10000) / 100}%)`);
          } else {
            metrics.forecast_accuracy[horizon] = {
              status: "not_available",
              reason: `No actual sales data uploaded for this ${horizon}-day forecast window yet.`
            };
          }
        }
      } else {
        console.log(`   ℹ️  No evaluation data available (first forecast or no overlapping actuals)`);
      }

      // Calculate variance for legacy compatibility
      const variance = actualSalesTotal > 0 
        ? Math.round(((metrics.predicted_sales["7"].total - actualSalesTotal) / actualSalesTotal) * 100)
        : 0;

      // Build legacy stats for Navbar compatibility
      const stats = {
        predictedSales: Math.round(metrics.predicted_sales["7"].total),
        actualSales: Math.round(actualSalesTotal),
        forecastAccuracy: metrics.forecast_accuracy["7"].status === "available" 
          ? metrics.forecast_accuracy["7"].accuracy_percent
          : 0,
        variance: variance,
        evaluationSummary: evaluationData?.horizons || {}
      };

      // Build inventory alerts list for legacy compatibility
      const inventoryAlerts = metrics.inventory_alerts.products.map(p => ({
        productName: p.product_name,
        category: p.category,
        demandLevel: p.demand_level,
        productId: p.product_id
      }));

      // STEP 10: Build complete response
      const response = {
        success: true,
        days: days,

        // File info
        salesFile: salesFiles[0].fileName,
        forecastFile: forecastFiles.length > 0 ? forecastFiles[0].fileName : "N/A",
        futureFile: latestForecastFile.fileName,

        // Chart data
        combinedData: combinedData,

        // NEW STRUCTURE: wMAPE-based metrics with date ranges
        metrics: metrics,

        // LEGACY: Keep for backward compatibility
        stats: stats,
        inventoryAlerts: inventoryAlerts,
        categoryAccuracy: pythonForecast.category_accuracy || [],
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
