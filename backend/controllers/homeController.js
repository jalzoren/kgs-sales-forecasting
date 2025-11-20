const homeService = require("../services/homeService");

class HomeController {
  /**
   * Get dashboard data for home page
   * Combines actual sales, past forecasts, and future forecasts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getDashboard(req, res) {
    try {
      console.log("📊 Dashboard route hit!");

      // Extract user ID from session
      const userId = req.session.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized" 
        });
      }

      // Get directory paths
      const salesFolder = homeService.getSalesDirectory(userId);
      const forecastFolder = homeService.getForecastDirectory(userId);

      // Validate that directories exist
      if (!homeService.validateDirectories(salesFolder, forecastFolder)) {
        return res.json(
          homeService.buildEmptyResponse(
            "No data available yet. Please upload sales data and generate forecasts."
          )
        );
      }

      // Get files from both directories
      const salesFiles = homeService.getFiles(salesFolder);
      const forecastFiles = homeService.getFiles(forecastFolder, ['.xlsx']);

      // Check if files exist
      if (!salesFiles.length || !forecastFiles.length) {
        return res.json(
          homeService.buildEmptyResponse(
            "Please upload sales data and generate forecasts."
          )
        );
      }

      // Read actual sales data (most recent file)
      console.log(`📈 Reading sales data from: ${salesFiles[0].fileName}`);
      const salesData = homeService.readSalesData(salesFiles[0]);

      // Read forecasted revenue (previous week predicting this week's sales)
      console.log(`🔍 Searching for matching forecast...`);
      const forecastData = homeService.findMatchingForecast(salesData, forecastFiles);
      
      if (forecastData.length > 0) {
        console.log(`✅ Found matching forecast with ${forecastData.length} data points`);
      } else {
        console.log(`⚠️ No matching forecast found for sales period`);
      }

      // Read future forecast (next week) - most recent forecast file
      console.log(`🔮 Reading future forecast from: ${forecastFiles[0].fileName}`);
      const futureData = homeService.readForecastData(forecastFiles[0], '7d_forecast');

      // Combine all data by date
      console.log(`🔗 Combining data...`);
      const combinedData = homeService.combineDataByDate(salesData, forecastData, futureData);

      // Build response
      const response = homeService.buildDashboardResponse({
        salesFiles,
        forecastFiles,
        salesData,
        forecastData,
        futureData,
        combinedData
      });

      console.log(`✅ Dashboard data prepared:`);
      console.log(`   - Sales records: ${salesData.length}`);
      console.log(`   - Forecast records: ${forecastData.length}`);
      console.log(`   - Future records: ${futureData.length}`);
      console.log(`   - Combined records: ${combinedData.length}`);

      res.json(response);

    } catch (err) {
      console.error("❌ Dashboard error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Server error", 
        details: err.message 
      });
    }
  }
}

module.exports = new HomeController();