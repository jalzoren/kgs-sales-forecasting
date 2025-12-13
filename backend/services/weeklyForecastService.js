// backend/services/weeklyForecastService.js
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEEKLY FORECAST SERVICE
 * Orchestrates the full weekly forecasting + evaluation pipeline:
 * 1. Load weekly actuals
 * 2. Find & evaluate previous forecast against new actuals
 * 3. Generate new forecast
 * 4. Aggregate dashboard metrics
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require("path");
const fs = require("fs");
const PythonService = require("./pythonService");
const homeService = require("./homeService");

class WeeklyForecastService {
  /**
   * Main entry point: Process weekly upload and run full pipeline
   * Called after weekly sales data is uploaded
   *
   * @param {string} userId - User ID
   * @param {string} weeklyFilePath - Path to the newly uploaded weekly file
   * @returns {Promise<Object>} Dashboard-ready metrics
   */
  async processWeeklyUpload(userId, weeklyFilePath) {
    console.log("\n" + "=".repeat(80));
    console.log("📅 WEEKLY FORECAST PIPELINE - Full Cycle");
    console.log("=".repeat(80));

    try {
      const result = {
        success: false,
        user_id: userId,
        timestamp: new Date().toISOString(),
        steps: {}
      };

      // STEP 1: Load weekly actuals and extract date range
      console.log("\n[STEP 1] Loading weekly actuals...");
      const weeklyData = this.loadWeeklyActuals(weeklyFilePath);
      if (!weeklyData || weeklyData.length === 0) {
        throw new Error("Weekly data is empty or invalid");
      }
      const weeklyDateRange = this.extractDateRange(weeklyData);
      console.log(`   ✅ Loaded ${weeklyData.length} records`);
      console.log(`   📅 Date range: ${weeklyDateRange.start} to ${weeklyDateRange.end}`);
      result.steps.load_actuals = { success: true, records: weeklyData.length, dateRange: weeklyDateRange };

      // STEP 2: Find & evaluate previous forecast
      console.log("\n[STEP 2] Evaluating previous forecast...");
      let evaluationResult = null;
      try {
        evaluationResult = await this.evaluatePreviousForecast(userId, weeklyDateRange);
        if (evaluationResult && evaluationResult.success) {
          console.log(`   ✅ Evaluation complete`);
          if (evaluationResult.horizons && evaluationResult.horizons["7"]) {
            const metrics = evaluationResult.horizons["7"].metrics;
            if (metrics) {
              console.log(`      MAPE: ${metrics.MAPE}%, MAE: ${metrics.MAE}, RMSE: ${metrics.RMSE}`);
            }
          }
          result.steps.evaluation = { success: true, data: evaluationResult };
        } else {
          console.log(`   ℹ️  No previous forecast to evaluate (first upload or no overlap)`);
          result.steps.evaluation = { success: false, note: "No previous forecast found" };
        }
      } catch (evalErr) {
        console.error(`   ⚠️  Evaluation error: ${evalErr.message}`);
        result.steps.evaluation = { success: false, error: evalErr.message };
      }

      // STEP 3: Generate new forecast
      console.log("\n[STEP 3] Generating new forecast...");
      let forecastResult = null;
      try {
        forecastResult = await PythonService.generateForecast(userId);
        console.log(`   ✅ Forecast generated: ${path.basename(forecastResult)}`);
        result.steps.forecast = { success: true, file: forecastResult };
      } catch (forecastErr) {
        console.error(`   ⚠️  Forecast error: ${forecastErr.message}`);
        result.steps.forecast = { success: false, error: forecastErr.message };
        // Don't fail the whole pipeline, continue with metrics aggregation
      }

      // STEP 4: Aggregate dashboard metrics
      console.log("\n[STEP 4] Aggregating dashboard metrics...");
      const dashboardMetrics = await this.aggregateDashboardMetrics(userId, weeklyData, evaluationResult, forecastResult);
      result.metrics = dashboardMetrics;
      console.log(`   ✅ Metrics aggregated`);
      console.log(`      Predicted 7d: ${dashboardMetrics.predicted_sales_7d}`);
      console.log(`      Actual 7d: ${dashboardMetrics.actual_sales_7d}`);
      console.log(`      Forecast Accuracy (MAPE): ${dashboardMetrics.forecast_accuracy_7d?.MAPE || 'N/A'}%`);
      console.log(`      Inventory Alerts: ${dashboardMetrics.inventory_alerts?.length || 0}`);

      result.success = true;
      console.log("\n" + "=".repeat(80));
      console.log("✅ WEEKLY CYCLE COMPLETE");
      console.log("=".repeat(80) + "\n");

      return result;
    } catch (err) {
      console.error("\n❌ WEEKLY PIPELINE FAILED:");
      console.error("   " + err.message);
      console.error("=".repeat(80) + "\n");
      throw err;
    }
  }

  /**
   * Load weekly actuals from Excel file
   * @param {string} filePath - Path to weekly Excel file
   * @returns {Array} Array of records with Date, Product_ID, Units_Sold
   */
  loadWeeklyActuals(filePath) {
    try {
      const XLSX = require("xlsx");
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      // Normalize: ensure Date and Units_Sold columns exist
      return data.map((row) => ({
        Date: new Date(row.Date || row.date),
        Product_ID: String(row.Product_ID || row.product_id || row.ProductID).trim(),
        Units_Sold: parseFloat(row.Units_Sold || row.units_sold || row.Quantity || 0)
      }));
    } catch (err) {
      console.error(`Failed to load weekly actuals: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract date range from weekly data
   * @param {Array} data - Weekly records
   * @returns {Object} { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
   */
  extractDateRange(data) {
    if (!data || data.length === 0) return null;

    const dates = data.map((r) => new Date(r.Date)).sort((a, b) => a - b);
    return {
      start: dates[0].toISOString().split("T")[0],
      end: dates[dates.length - 1].toISOString().split("T")[0]
    };
  }

  /**
   * Find and evaluate the previous forecast (from last week)
   * Calls the ML service /api/evaluate endpoint which handles:
   * - Finding matching forecast JSON
   * - Comparing against weekly actuals
   * - Computing MAPE/MAE/RMSE
   *
   * @param {string} userId - User ID
   * @param {Object} weeklyDateRange - { start, end } of new actuals
   * @returns {Promise<Object>} Evaluation result with metrics
   */
  async evaluatePreviousForecast(userId, weeklyDateRange) {
    try {
      // Call the evaluation endpoint on ML service
      // This will find previous forecasts that overlap the new actuals
      // and compute metrics
      const evaluationResult = await PythonService.evaluateForecast(userId);
      
      if (evaluationResult && evaluationResult.success) {
        return evaluationResult;
      }
      return null;
    } catch (err) {
      console.error(`Evaluation failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Aggregate all dashboard metrics from actuals, forecast, and evaluation
   * 
   * @param {string} userId - User ID
   * @param {Array} weeklyData - Weekly actual sales data
   * @param {Object} evaluationResult - Result from evaluation (may be null)
   * @param {string} forecastFilePath - Path to generated forecast file
   * @returns {Promise<Object>} Dashboard-ready metrics object
   */
  async aggregateDashboardMetrics(userId, weeklyData, evaluationResult, forecastFilePath) {
    const metrics = {
      user_id: userId,
      timestamp: new Date().toISOString(),
      
      // Actual sales from uploaded weekly data (last 7 days)
      actual_sales_7d: 0,
      actual_sales_by_product: [],
      actual_date_range: null,
      
      // Predicted sales from new forecast (next 7 days)
      predicted_sales_7d: 0,
      predicted_by_product: [],
      forecast_date_range: null,
      
      // Accuracy metrics from evaluation
      forecast_accuracy_7d: {
        MAPE: null,
        MAE: null,
        RMSE: null,
        records: 0
      },
      
      // Inventory alerts (items needing action)
      inventory_alerts: [],
      
      // Metadata
      evaluation_completed: false,
      forecast_file: forecastFilePath ? path.basename(forecastFilePath) : null
    };

    // Extract actual sales metrics from weekly data
    if (weeklyData && weeklyData.length > 0) {
      metrics.actual_sales_7d = weeklyData.reduce((sum, r) => sum + (r.Units_Sold || 0), 0);
      metrics.actual_date_range = this.extractDateRange(weeklyData);
      
      // Group by product
      const byProduct = {};
      weeklyData.forEach((r) => {
        const pid = String(r.Product_ID);
        if (!byProduct[pid]) {
          byProduct[pid] = { Product_ID: pid, Units_Sold: 0, Days: 0 };
        }
        byProduct[pid].Units_Sold += r.Units_Sold || 0;
        byProduct[pid].Days += 1;
      });
      metrics.actual_sales_by_product = Object.values(byProduct);
    }

    // Extract forecast metrics from generated forecast file
    if (forecastFilePath && fs.existsSync(forecastFilePath)) {
      try {
        const XLSX = require("xlsx");
        const workbook = XLSX.readFile(forecastFilePath);
        
        // Read 7d forecast sheet
        if (workbook.SheetNames.includes("7d_forecast")) {
          const sheet = workbook.Sheets["7d_forecast"];
          const data = XLSX.utils.sheet_to_json(sheet);
          
          metrics.predicted_sales_7d = data.reduce((sum, r) => sum + (r.Forecast_Qty || r.forecast_qty || 0), 0);
          
          // Group by product
          const byProduct = {};
          data.forEach((r) => {
            const pid = String(r.Product_ID || r.product_id);
            if (!byProduct[pid]) {
              byProduct[pid] = { Product_ID: pid, Forecast_Qty: 0, Days: 0 };
            }
            byProduct[pid].Forecast_Qty += r.Forecast_Qty || r.forecast_qty || 0;
            byProduct[pid].Days += 1;
          });
          metrics.predicted_by_product = Object.values(byProduct);
          
          // Extract date range from first record
          if (data.length > 0) {
            const dates = data.map((r) => new Date(r.Date)).sort((a, b) => a - b);
            metrics.forecast_date_range = {
              start: dates[0].toISOString().split("T")[0],
              end: dates[dates.length - 1].toISOString().split("T")[0]
            };
          }
        }
        
        // Read inventory alerts if available
        if (workbook.SheetNames.includes("demand_alerts")) {
          const sheet = workbook.Sheets["demand_alerts"];
          const data = XLSX.utils.sheet_to_json(sheet);
          
          metrics.inventory_alerts = data
            .filter((row) => row.Demand_Level === "HIGH DEMAND")
            .slice(0, 5)
            .map((row) => ({
              product_id: row.Product_ID,
              product_name: row.Product_Name,
              category: row.Category,
              avg_daily_sales: row.Avg_Daily_Sales,
              demand_level: row.Demand_Level,
              recommendation: row.Recommendation
            }));
        }
      } catch (err) {
        console.warn(`Could not extract forecast metrics: ${err.message}`);
      }
    }

    // Extract evaluation metrics (MAPE/MAE/RMSE)
    if (evaluationResult && evaluationResult.horizons && evaluationResult.horizons["7"]) {
      const eval7d = evaluationResult.horizons["7"];
      if (eval7d.status === "evaluated" && eval7d.metrics) {
        metrics.forecast_accuracy_7d = {
          MAPE: eval7d.metrics.MAPE,
          MAE: eval7d.metrics.MAE,
          RMSE: eval7d.metrics.RMSE,
          records: eval7d.records || 0
        };
        metrics.evaluation_completed = true;
        metrics.evaluation_date = evaluationResult.evaluation_date;
      }
    }

    return metrics;
  }

  /**
   * Get latest aggregated metrics for dashboard (without running pipeline)
   * Used to fetch cached results
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Latest metrics or null
   */
  async getLatestMetrics(userId) {
    try {
      const metricsDir = path.join(__dirname, "../files", "metrics", `user_${userId}`);
      if (!fs.existsSync(metricsDir)) {
        return null;
      }

      const files = fs
        .readdirSync(metricsDir)
        .filter((f) => f.startsWith("metrics_") && f.endsWith(".json"))
        .sort()
        .reverse(); // Newest first

      if (files.length === 0) {
        return null;
      }

      const latestFile = path.join(metricsDir, files[0]);
      const data = JSON.parse(fs.readFileSync(latestFile, "utf-8"));
      return data;
    } catch (err) {
      console.warn(`Could not load cached metrics: ${err.message}`);
      return null;
    }
  }

  /**
   * Save aggregated metrics to persistent storage
   * 
   * @param {string} userId - User ID
   * @param {Object} metrics - Aggregated metrics object
   */
  saveMetrics(userId, metrics) {
    try {
      const metricsDir = path.join(__dirname, "../files", "metrics", `user_${userId}`);
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `metrics_${timestamp}.json`;
      const filepath = path.join(metricsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2), "utf-8");
      console.log(`   📁 Metrics saved: ${filename}`);
      return filepath;
    } catch (err) {
      console.error(`Failed to save metrics: ${err.message}`);
      return null;
    }
  }
}

module.exports = new WeeklyForecastService();
