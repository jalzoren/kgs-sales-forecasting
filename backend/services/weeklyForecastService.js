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
   * NEW STRUCTURE: Calculate metrics with date ranges and wMAPE formula
   * 
   * wMAPE_sales = |Actual_Revenue - Forecast_Revenue| / Actual_Revenue
   * Accuracy (%) = (1 - wMAPE_sales) × 100
   * 
   * @param {string} userId - User ID
   * @param {Array} weeklyData - Weekly actual sales data (from upload)
   * @param {Object} evaluationResult - Result from evaluation (per-horizon)
   * @param {string} forecastFilePath - Path to generated forecast file
   * @returns {Promise<Object>} Dashboard-ready metrics with date ranges and wMAPE accuracy
   */
  async aggregateDashboardMetrics(userId, weeklyData, evaluationResult, forecastFilePath) {
    const metrics = {
      user_id: userId,
      timestamp: new Date().toISOString(),
      
      // ✅ NEW STRUCTURE: Multi-horizon predicted sales with date ranges
      predicted_sales: {
        "7": {
          label: "",  // Will be filled with "Forecasting YYYY/MM/DD - YYYY/MM/DD"
          total_revenue: 0,
          date_range: { start: null, end: null }
        },
        "30": {
          label: "",
          total_revenue: 0,
          date_range: { start: null, end: null }
        },
        "90": {
          label: "",
          total_revenue: 0,
          date_range: { start: null, end: null }
        }
      },
      
      // ✅ NEW STRUCTURE: Actual sales with date range
      actual_sales: {
        label: "",  // Will be filled with "Sales Data YYYY/MM/DD - YYYY/MM/DD"
        total_revenue: 0,
        date_range: { start: null, end: null }
      },
      
      // ✅ NEW STRUCTURE: wMAPE-based forecast accuracy per horizon
      forecast_accuracy: {
        "7": {
          status: "not_available",
          accuracy_percent: null,
          wmape: null,
          forecasted_on: null,
          evaluated_on: null,
          reason: null
        },
        "30": {
          status: "not_available",
          accuracy_percent: null,
          wmape: null,
          forecasted_on: null,
          evaluated_on: null,
          reason: null
        },
        "90": {
          status: "not_available",
          accuracy_percent: null,
          wmape: null,
          forecasted_on: null,
          evaluated_on: null,
          reason: null
        }
      },
      
      // ✅ NEW STRUCTURE: Inventory alerts as list of HIGH DEMAND products
      inventory_alerts: {
        alert_count: 0,
        products: []
      },
      
      // Metadata
      computed_at: new Date().toISOString().split("T")[0]
    };

    // ============================================================
    // 1. Extract Actual Sales with Date Range
    // ============================================================
    if (weeklyData && weeklyData.length > 0) {
      // Sum Total_Sales (revenue)
      metrics.actual_sales.total_revenue = weeklyData.reduce((sum, r) => sum + (r.Total_Sales || 0), 0);
      
      // Extract date range
      // Use robust parser to handle Date objects, strings (DD/MM/YYYY) and numbers
      const dates = weeklyData
        .map((r) => this.parseAnyDate(r.Date || r.date))
        .filter(Boolean)
        .sort((a, b) => a - b);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];
      
      metrics.actual_sales.date_range = {
        start: this.formatDate(startDate),
        end: this.formatDate(endDate)
      };
      
      metrics.actual_sales.label = 
        `Actual Sales (Sales Data ${metrics.actual_sales.date_range.start} – ${metrics.actual_sales.date_range.end})`;
    }

    // ============================================================
    // 2. Extract Predicted Sales (Multi-Horizon) with Date Ranges
    // ============================================================
    if (forecastFilePath && fs.existsSync(forecastFilePath)) {
      try {
        const XLSX = require("xlsx");
        const workbook = XLSX.readFile(forecastFilePath);
        
        // Read all three forecast sheets (7d, 30d, 90d)
        const horizons = ["7", "30", "90"];
        
        for (const horizon of horizons) {
          const sheetName = `${horizon}d_forecast`;
          
          if (workbook.SheetNames.includes(sheetName)) {
            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet);
            
            if (data.length > 0) {
              // Sum Revenue_Estimate
              metrics.predicted_sales[horizon].total_revenue = 
                data.reduce((sum, r) => sum + (r.Revenue_Estimate || 0), 0);
              
              // Extract date range using robust parser
              const dates = data
                .map((r) => this.parseAnyDate(r.Date || r.date))
                .filter(Boolean)
                .sort((a, b) => a - b);
              const startDate = dates[0];
              const endDate = dates[dates.length - 1];
              
              metrics.predicted_sales[horizon].date_range = {
                start: this.formatDate(startDate),
                end: this.formatDate(endDate)
              };
              
              metrics.predicted_sales[horizon].label = 
                `Predicted Sales (Forecasting ${metrics.predicted_sales[horizon].date_range.start} – ${metrics.predicted_sales[horizon].date_range.end})`;
            }
          }
        }
        
        // ============================================================
        // 3. Extract Inventory Alerts (HIGH DEMAND Products)
        // ============================================================
        if (workbook.SheetNames.includes("demand_alerts")) {
          const sheet = workbook.Sheets["demand_alerts"];
          const data = XLSX.utils.sheet_to_json(sheet);
          
          const highDemandProducts = data.filter((row) => row.Demand_Level === "HIGH DEMAND");
          
          metrics.inventory_alerts.alert_count = highDemandProducts.length;
          metrics.inventory_alerts.products = highDemandProducts.map((row) => ({
            product_id: row.Product_ID,
            product_name: row.Product_Name,
            category: row.Category,
            demand_level: row.Demand_Level
          }));
        }
      } catch (err) {
        console.warn(`Could not extract forecast metrics: ${err.message}`);
      }
    }

    // ============================================================
    // 4. Calculate wMAPE-Based Forecast Accuracy (Per Horizon)
    // ============================================================
    if (evaluationResult && evaluationResult.horizons) {
      const horizons = ["7", "30", "90"];
      
      for (const horizon of horizons) {
        const eval_horizon = evaluationResult.horizons[horizon];
        
        if (eval_horizon && eval_horizon.status === "evaluated" && eval_horizon.metrics) {
          // ✅ Calculate wMAPE on aggregated revenue totals
          // wMAPE_sales = |Total_Forecast_Revenue - Total_Actual_Revenue| / Total_Actual_Revenue
          
          // For now, we'll use the aggregated Units_Sold from evaluation
          // In a real scenario, you'd have revenue data in evaluation
          const total_forecast = eval_horizon.total_forecast_units || eval_horizon.records;
          const total_actual = eval_horizon.total_actual_units || eval_horizon.records;
          
          // If we have evaluation data, calculate wMAPE
          if (total_forecast && total_actual && total_actual !== 0) {
            const wmape = Math.abs(total_forecast - total_actual) / total_actual;
            const accuracy_percent = Math.round((1 - wmape) * 100 * 100) / 100;  // 2 decimal places
            
            metrics.forecast_accuracy[horizon] = {
              status: "available",
              accuracy_percent: accuracy_percent,
              wmape: Math.round(wmape * 10000) / 100,  // Convert to percentage
              forecasted_on: this.formatDate(new Date(eval_horizon.forecast_start_date || Date.now())),
              evaluated_on: this.formatDate(new Date(evaluationResult.evaluation_date || Date.now())),
              reason: null
            };
          }
        } else {
          // Evaluation not available - provide reason
          metrics.forecast_accuracy[horizon] = {
            status: "not_available",
            reason: `No actual sales data uploaded for ${horizon}-day forecast window yet.`
          };
        }
      }
    }

    return metrics;
  }
  
  /**
   * Format date as YYYY/MM/DD
   */
  // Robust parser for a variety of date representations used across sheets
  parseAnyDate(value) {
    if (value == null) return null;
    // Already a Date
    if (value instanceof Date) return value;

    // Excel-style numeric serial (common when reading XLSX as numbers)
    if (typeof value === "number" && !Number.isNaN(value)) {
      // Excel epoch: 1899-12-30
      const epoch = new Date(1899, 11, 30);
      return new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
    }

    if (typeof value === "string") {
      const s = value.trim();
      // DD/MM/YYYY
      if (s.includes("/")) {
        const parts = s.split("/").map(p => p.trim());
        if (parts.length === 3) {
          const d = Number(parts[0]);
          const m = Number(parts[1]);
          const y = Number(parts[2]);
          if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
            return new Date(y, m - 1, d);
          }
        }
      }

      // YYYY-MM-DD
      if (s.includes("-")) {
        const parts = s.split("-").map(p => p.trim());
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]);
          const d = Number(parts[2]);
          if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
            return new Date(y, m - 1, d);
          }
        }
      }

      // Fallback to Date parser
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    // Last resort: try constructing Date
    try {
      const nd = new Date(value);
      if (!Number.isNaN(nd.getTime())) return nd;
    } catch (e) {}
    return null;
  }

  formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
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
