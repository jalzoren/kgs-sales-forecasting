// backend/controllers/homeController.js
/**
 * ═══════════════════════════════════════════════════════════════
 * HOME CONTROLLER - Dashboard Data Orchestrator
 * ═══════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 *   Handles /api/home/dashboard endpoint
 *   Orchestrates data collection for the main dashboard
 * 
 * USED BY:
 *   - routes/homeRoutes.js → router.get("/api/home/dashboard")
 *   - frontend/Home.jsx → fetch dashboard data
 *   - frontend/Navbar.jsx → fetch stats
 * 
 * DEPENDS ON:
 *   - services/homeService.js → all data processing methods
 * 
 * DATA FLOW:
 *   1. Get user ID from session
 *   2. homeService.getSalesDirectory() → check sales files exist
 *   3. homeService.getForecastDirectory() → check forecast files exist
 *   4. homeService.readSalesData() → read actual sales
 *   5. homeService.readForecastData() → read predictions
 *   6. homeService.combineDataByDate() → merge for chart
 *   7. homeService.calculateDashboardStats() → compute metrics
 *   8. homeService.getInventoryAlerts() → high-demand products
 *   9. homeService.getCategoryAccuracy() → forecast confidence
 *   10. Return JSON response to frontend
 * ═══════════════════════════════════════════════════════════════
 */

const homeService = require("../services/homeService");

class HomeController {
  async getDashboard(req, res) {
    try {
      console.log("\n" + "="*70);
      console.log("📊 DASHBOARD REQUEST RECEIVED");
      console.log("="*70);

      // STEP 1: Authentication check
      const userId = req.session.user?.id;
      if (!userId) {
        console.log("❌ Unauthorized: No user ID in session");
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized" 
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
      const forecastFiles = homeService.getFiles(forecastFolder, ['.xlsx']);

      if (!salesFiles.length || !forecastFiles.length) {
        console.log("⚠️ No files found - returning empty response");
        return res.json(
          homeService.buildEmptyResponse(
            "Please upload sales data and generate forecasts."
          )
        );
      }
      console.log(`✅ Found ${salesFiles.length} sales files, ${forecastFiles.length} forecast files`);

      // STEP 4: Read actual sales data
      console.log(`\n📖 Reading sales from: ${salesFiles[0].fileName}`);
      const salesData = homeService.readSalesData(salesFiles[0]);
      
      if (salesData.length === 0) {
        console.log("⚠️ No valid sales data");
        return res.json(
          homeService.buildEmptyResponse("No valid sales data found.")
        );
      }
      console.log(`✅ Loaded ${salesData.length} days of sales data`);

      const lastSalesDate = new Date(salesData[salesData.length - 1].date);
      const firstSalesDate = new Date(salesData[0].date);
      console.log(`   Date range: ${firstSalesDate.toISOString().split('T')[0]} to ${lastSalesDate.toISOString().split('T')[0]}`);

      // STEP 5: Find matching historical forecast
      console.log("\n🔍 Searching for matching historical forecast...");
      let forecastData = homeService.findMatchingForecast(salesData, forecastFiles);
      console.log(`   Found ${forecastData.length} matching forecast days`);

      // STEP 6: Get latest future forecast file
      const latestForecastFile = [...forecastFiles]
        .sort((a, b) => {
          const rangeA = homeService.extractDateRangeFromFilename(a.fileName);
          const rangeB = homeService.extractDateRangeFromFilename(b.fileName);
          if (!rangeA) return 1;
          if (!rangeB) return -1;
          return rangeB.start - rangeA.start;
        })[0];

      console.log(`\n📈 Reading future forecast from: ${latestForecastFile.fileName}`);
      const allFutureForecast = homeService.readForecastData(latestForecastFile, '7d_forecast');
      
      // Get only next 7 days after last sales date
      const futureData = allFutureForecast
        .filter(d => new Date(d.date) > lastSalesDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 7);
      console.log(`   Next 7 days: ${futureData.length} days`);

      // STEP 7: Combine all data for chart
      console.log("\n🔗 Combining datasets...");
      const combinedData = homeService.combineDataByDate(salesData, forecastData, futureData);
      console.log(`   Combined: ${combinedData.length} total data points`);

      // STEP 8: Calculate dashboard statistics
      console.log("\n📊 Calculating statistics...");
      const stats = homeService.calculateDashboardStats(salesData, forecastData, futureData);
      console.log("   Stats:", stats);

      // STEP 9: Get inventory alerts
      console.log("\n🚨 Fetching inventory alerts...");
      const inventoryAlerts = homeService.getInventoryAlerts(userId);
      console.log(`   Alerts found: ${inventoryAlerts.length}`);

      // STEP 10: Get category accuracy
      console.log("\n📈 Calculating category accuracy...");
      const categoryAccuracy = homeService.getCategoryAccuracy(userId);
      console.log(`   Categories: ${categoryAccuracy.length}`);

      // STEP 11: Build complete response
      const response = {
        success: true,
        
        // File info (for debugging/display)
        salesFile: salesFiles[0].fileName,
        forecastFile: forecastData.length > 0
          ? forecastFiles.find(f => {
              const range = homeService.extractDateRangeFromFilename(f.fileName);
              return range && range.start <= lastSalesDate && range.end >= firstSalesDate;
            })?.fileName || "N/A"
          : "No matching forecast",
        futureFile: latestForecastFile.fileName,
        
        // Chart data (for Sales Overview in Home.jsx)
        combinedData: combinedData,
        
        // Stats (for Navbar.jsx)
        stats: {
          predictedSales: stats.predictedSales || 0,
          actualSales: stats.actualSales || 0,
          forecastAccuracy: stats.forecastAccuracy || 0,
          variance: stats.variance || 0
        },
        
        // Inventory Alerts (for Home.jsx right panel)
        inventoryAlerts: inventoryAlerts.map(alert => ({
          productName: alert.productName,
          avgDailySales: alert.avgDailySales,
          category: alert.category,
          demandLevel: alert.demandLevel,
          recommendation: alert.recommendation
        })),
        
        // Category Accuracy (for Home.jsx right panel)
        categoryAccuracy: categoryAccuracy.map(cat => ({
          name: cat.name,
          accuracy: cat.accuracy
        }))
      };

      console.log("\n" + "="*70);
      console.log("✅ DASHBOARD DATA READY - Sending response");
      console.log("="*70 + "\n");
      
      res.json(response);
      
    } catch (err) {
      console.error("\n" + "="*70);
      console.error("❌ DASHBOARD ERROR:");
      console.error("="*70);
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
      console.error("="*70 + "\n");
      
      res.status(500).json({
        success: false,
        error: "Server error",
        details: err.message
      });
    }
  }
}

module.exports = new HomeController();