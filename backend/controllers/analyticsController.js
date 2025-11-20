const analyticsService = require("../services/analyticsService");

class AnalyticsController {
  /**
   * Get analytics data for forecast visualization
   * Handles the /api/forecast/analytics endpoint
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getAnalytics(req, res) {
    console.log("🔍 Analytics endpoint hit!");
    
    try {
      // Extract parameters
      const userId = req.session.user?.id;
      const horizon = req.query.horizon || "90d";
      
      console.log(`📊 Fetching analytics for user ${userId}, horizon: ${horizon}`);
      
      // Validate user authentication
      if (!userId) {
        console.log("❌ No user ID in session");
        return res.status(401).json({ 
          message: "Unauthorized: User not logged in" 
        });
      }

      // Get forecast directory
      const forecastDir = analyticsService.getForecastDirectory(userId);
      console.log(`📂 Absolute forecast directory: ${forecastDir}`);

      // Check if directory exists
      if (!analyticsService.directoryExists(forecastDir)) {
        console.log(`❌ No forecast directory found`);
        return res.json([]);
      }

      // Get all Excel files
      let allFiles;
      try {
        allFiles = analyticsService.getExcelFiles(forecastDir);
        console.log(`📄 Found ${allFiles.length} Excel file(s)`);
      } catch (readErr) {
        console.error(`❌ Error reading directory:`, readErr.message);
        return res.status(500).json({ 
          message: "Failed to read forecast directory", 
          error: readErr.message 
        });
      }

      // Check if files exist
      if (allFiles.length === 0) {
        console.log(`⚠️ No Excel files found`);
        return res.json([]);
      }

      // Get latest file
      const latestFile = allFiles[0];
      console.log(`📄 Reading: ${latestFile.fileName}`);

      // Read Excel workbook
      let workbook, sheetNames;
      try {
        const result = analyticsService.readExcelWorkbook(latestFile.filePath);
        workbook = result.workbook;
        sheetNames = result.sheetNames;
        console.log(`📋 Available sheets:`, sheetNames);
      } catch (readErr) {
        console.error(`❌ Error reading Excel file:`, readErr.message);
        return res.status(500).json({ 
          message: "Failed to read Excel file", 
          error: readErr.message 
        });
      }

      // Find target sheet for horizon
      const targetSheet = analyticsService.findTargetSheet(sheetNames, horizon);
      
      if (!targetSheet) {
        console.error(`❌ No suitable sheet found for horizon ${horizon}`);
        return res.status(404).json({ 
          message: `No forecast sheet found for ${horizon}` 
        });
      }

      console.log(`✅ Using sheet: ${targetSheet} for ${horizon}`);

      // Read sheet data
      let data;
      try {
        data = analyticsService.readSheetData(workbook, targetSheet);
        console.log(`📊 Read ${data.length} rows from ${targetSheet}`);
      } catch (readErr) {
        console.error(`❌ Error reading sheet:`, readErr.message);
        return res.status(500).json({ 
          message: `Sheet ${targetSheet} not found`,
          error: readErr.message
        });
      }

      // Check if data is empty
      if (data.length === 0) {
        console.warn(`⚠️ No data in sheet ${targetSheet}`);
        return res.json([]);
      }

      // Log sample row for debugging
      if (data.length > 0) {
        console.log(`📋 Sample row:`, data[0]);
      }

      // Format data for analytics
      const formattedData = analyticsService.formatAnalyticsData(
        data, 
        latestFile, 
        targetSheet
      );

      // Sort by date
      const sortedData = analyticsService.sortByDate(formattedData);

      // Get expected days for horizon
      const expectedDays = analyticsService.getExpectedDays(horizon);

      // Filter to keep only last N days
      const filteredData = analyticsService.filterLastNDays(sortedData, expectedDays);

      // Log summary
      analyticsService.logDataSummary(filteredData, horizon);

      // Return filtered data
      res.json(filteredData);

    } catch (err) {
      console.error("❌ Analytics error:", err);
      console.error("   Stack:", err.stack);
      return res.status(500).json({ 
        message: "Failed to get analytics data", 
        error: err.message 
      });
    }
  }
}

module.exports = new AnalyticsController();