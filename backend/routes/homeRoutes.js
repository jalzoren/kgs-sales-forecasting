const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { requireAuth } = require("../middleware/authMiddleware.js");

router.get("/api/home/dashboard", requireAuth, async (req, res) => {
  try {
    console.log("📊 Dashboard route hit!");

    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const salesFolder = path.join(__dirname, "../files/salesData", `user_${userId}`);
    const forecastFolder = path.join(__dirname, "../files/forecastData", `user_${userId}`);

    // Validate folders
    if (!fs.existsSync(salesFolder) || !fs.existsSync(forecastFolder)) {
      return res.json({
        success: true,
        message: "No data available yet. Please upload sales data and generate forecasts.",
        salesData: [],
        forecastData: [],
        futureData: [],
        combinedData: []
      });
    }

    // Helper: get files sorted by modified time (newest first)
    const getFiles = (folder, exts = ['.xlsx', '.csv']) => {
      return fs.readdirSync(folder)
        .filter(f => exts.includes(path.extname(f)) && !f.startsWith('~$'))
        .map(f => ({ fileName: f, filePath: path.join(folder, f), mtime: fs.statSync(path.join(folder, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
    };

    const salesFiles = getFiles(salesFolder);
    const forecastFiles = getFiles(forecastFolder, ['.xlsx']);

    if (!salesFiles.length || !forecastFiles.length) {
      return res.json({
        success: true,
        message: "Please upload sales data and generate forecasts.",
        salesData: [],
        forecastData: [],
        futureData: [],
        combinedData: []
      });
    }

    // Parse Excel/CSV dates
    const parseDate = val => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      if (typeof val === 'number') return new Date(Date.UTC(1899,11,30) + val*86400*1000).toISOString().split('T')[0];
      if (typeof val === 'string') return val.split(' ')[0];
      return null;
    };

    // Read sales file
    const readSalesData = fileInfo => {
      try {
        let data = [];
        if (fileInfo.fileName.endsWith('.xlsx')) {
          const workbook = XLSX.readFile(fileInfo.filePath);
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(sheet);
        } else if (fileInfo.fileName.endsWith('.csv')) {
          const lines = fs.readFileSync(fileInfo.filePath, 'utf8').split('\n').filter(l => l.trim());
          if (lines.length < 2) return [];
          const headers = lines[0].split(',').map(h => h.trim());
          data = lines.slice(1).map(line => {
            const row = {};
            line.split(',').forEach((v, i) => row[headers[i]] = v);
            return row;
          });
        }

        const map = new Map();
        data.forEach(r => {
          const date = parseDate(r.Date || r.date);
          const revenue = parseFloat(r.Total_Amount || 0);
          if (date) map.set(date, (map.get(date) || 0) + revenue);
        });

        return Array.from(map.entries()).map(([date, revenue]) => ({ date, revenue }));
      } catch(err) {
        console.error("❌ Error reading sales file:", err.message);
        return [];
      }
    };

    // Read forecast file
    const readForecastData = (fileInfo, sheetName = '7d_forecast') => {
      try {
        const workbook = XLSX.readFile(fileInfo.filePath);
        if (!workbook.SheetNames.includes(sheetName)) sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const map = new Map();
        data.forEach(r => {
          const date = parseDate(r.Date || r.date);
          const revenue = parseFloat(r.Revenue_Estimate || 0);
          if (date) map.set(date, (map.get(date) || 0) + revenue);
        });

        return Array.from(map.entries()).map(([date, revenue]) => ({ date, revenue }));
      } catch(err) {
        console.error("❌ Error reading forecast file:", err.message);
        return [];
      }
    };

    // Actual sales (most recent file)
    const salesData = readSalesData(salesFiles[0]);

    // Forecasted revenue (previous week predicting this week's sales)
    let forecastData = [];
    if (salesData.length) {
      const firstSales = new Date(salesData[0].date);
      const lastSales = new Date(salesData[salesData.length-1].date);

      for (const f of forecastFiles) {
        const match = f.fileName.match(/forecast_week_(\d{8})_to_(\d{8})/);
        if (!match) continue;

        const start = new Date(`${match[1].slice(0,4)}-${match[1].slice(4,6)}-${match[1].slice(6,8)}`);
        const end   = new Date(`${match[2].slice(0,4)}-${match[2].slice(4,6)}-${match[2].slice(6,8)}`);

        if ((firstSales >= start && firstSales <= end) || (lastSales >= start && lastSales <= end)) {
          forecastData = readForecastData(f, '7d_forecast');
          break;
        }
      }
    }

    // Future forecast (next week)
    const futureData = readForecastData(forecastFiles[0], '7d_forecast');

    // Combine data by date (keep separate lines)
    const mapByDate = new Map();

    salesData.forEach(d => mapByDate.set(d.date, {
      date: d.date,
      actual_revenue: d.revenue,
      forecasted_revenue: null,
      future_revenue: null
    }));

    forecastData.forEach(d => {
      if (mapByDate.has(d.date)) mapByDate.get(d.date).forecasted_revenue = d.revenue;
      else mapByDate.set(d.date, { date: d.date, actual_revenue: null, forecasted_revenue: d.revenue, future_revenue: null });
    });

    futureData.forEach(d => {
      if (mapByDate.has(d.date)) mapByDate.get(d.date).future_revenue = d.revenue;
      else mapByDate.set(d.date, { date: d.date, actual_revenue: null, forecasted_revenue: null, future_revenue: d.revenue });
    });

    const combinedData = Array.from(mapByDate.values()).sort((a,b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      salesFile: salesFiles[0].fileName,
      forecastFile: forecastFiles.length > 1 ? forecastFiles[1].fileName : forecastFiles[0].fileName,
      futureFile: forecastFiles[0].fileName,
      salesData,
      forecastData,
      futureData,
      combinedData
    });

  } catch(err) {
    console.error("❌ Dashboard error:", err);
    res.status(500).json({ success: false, error: "Server error", details: err.message });
  }
});

module.exports = router;