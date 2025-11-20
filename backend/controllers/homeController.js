const homeService = require("../services/homeService");

class HomeController {
  async getDashboard(req, res) {
    try {
      console.log("Dashboard route hit!");

      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const salesFolder = homeService.getSalesDirectory(userId);
      const forecastFolder = homeService.getForecastDirectory(userId);

      if (!homeService.validateDirectories(salesFolder, forecastFolder)) {
        return res.json(
          homeService.buildEmptyResponse(
            "No data available yet. Please upload sales data and generate forecasts."
          )
        );
      }

      // Get files (newest first)
      const salesFiles = homeService.getFiles(salesFolder);
      const forecastFiles = homeService.getFiles(forecastFolder, ['.xlsx']);

      if (!salesFiles.length || !forecastFiles.length) {
        return res.json(
          homeService.buildEmptyResponse("Please upload sales data and generate forecasts.")
        );
      }

      // 1. Read actual sales (most recent file)
      console.log(`Reading sales data from: ${salesFiles[0].fileName}`);
      const salesData = homeService.readSalesData(salesFiles[0]);
      if (salesData.length === 0) {
        return res.json(homeService.buildEmptyResponse("No valid sales data found."));
      }

      const lastSalesDate = new Date(salesData[salesData.length - 1].date);
      const firstSalesDate = new Date(salesData[0].date);

      // 2. Find HISTORICAL forecast that predicted the CURRENT sales week
      console.log("Searching for historical forecast that matches sales week...");
      let forecastData = homeService.findMatchingForecast(salesData, forecastFiles);

      console.log(
        forecastData.length > 0
          ? `Found historical forecast: ${forecastData.length} days`
          : "No historical forecast found for this sales period"
      );

      // 3. Future forecast: always from the LATEST forecast file
      const latestForecastFile = forecastFiles[0]; // newest first
      console.log(`Reading future forecast from latest file: ${latestForecastFile.fileName}`);

      const allFutureForecast = homeService.readForecastData(latestForecastFile, '7d_forecast');

      const futureData = allFutureForecast
        .filter(d => new Date(d.date) > lastSalesDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 7);

      console.log(`Future forecast: ${futureData.length} days prepared`);

      // 4. Combine everything
      const combinedData = homeService.combineDataByDate(salesData, forecastData, futureData);

      // 5. Build response
      const response = {
        success: true,
        salesFile: salesFiles[0].fileName,
        // Use the file that actually provided the historical forecast (if any)
        forecastFile: forecastData.length > 0
          ? forecastFiles.find(f => {
              const range = homeService.extractDateRangeFromFilename(f.fileName);
              return range && range.start <= lastSalesDate && range.end >= firstSalesDate;
            })?.fileName || "N/A"
          : "No matching forecast",
        futureFile: latestForecastFile.fileName,
        salesData,
        forecastData,
        futureData,
        combinedData
      };

      console.log(`Dashboard ready!`);
      console.log(`   • Sales: ${salesData.length} days`);
      console.log(`   • Historical Forecast: ${forecastData.length} days`);
      console.log(`   • Future Forecast: ${futureData.length} days`);
      console.log(`   • Total Combined: ${combinedData.length} points`);

      res.json(response);
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({
        success: false,
        error: "Server error",
        details: err.message
      });
    }
  }
}

module.exports = new HomeController();