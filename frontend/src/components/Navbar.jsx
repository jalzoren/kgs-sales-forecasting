// frontend/src/components/Navbar.jsx
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FaBullseye } from "react-icons/fa";
import { IoSettingsOutline, IoInformationCircleOutline } from "react-icons/io5";
import Clock from "./Clock";
import NotificationBell from "./NotificationBell";
import SettingsModal from "./SettingsModal";
import UserMenu from "./UserMenu";
import "./components-css/Navbar.css";
import SessionManager from "../services/sessionManager";
import { useStats } from "./../pages/statsContext";

// ✨ Stats Calculator Class - Better Organization
class NavbarStatsCalculator {
  // Format date to YYYY/MM/DD
  static formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  // Get date range string
  static getDateRangeLabel(startDate, endDate) {
    if (!startDate || !endDate) return "Loading...";
    return `Date: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
  }

  // Calculate Forecast Accuracy using wMAPE
  static calculateForecastAccuracy(actualSales, predictedSales) {
    if (!actualSales || actualSales === 0) return 0;
    
    const wMAPE = Math.abs((actualSales - predictedSales) / actualSales) * 100;
    const accuracy = Math.max(0, 100 - wMAPE);
    
    return Math.round(accuracy);
  }

  // Get variance percentage
  static calculateVariance(actualSales, predictedSales) {
    if (!actualSales || actualSales === 0) return 0;
    
    const variance = ((predictedSales - actualSales) / actualSales) * 100;
    return Math.round(variance);
  }

  // Process dashboard data into navbar stats
  static processStats(data) {
    const stats = {
      predictedSales: 0,
      actualSales: 0,
      forecastAccuracy: 0,
      variance: 0,
      inventoryAlertsCount: 0,
      
      // Date ranges
      predictedSalesLabel: "Loading...",
      actualSalesLabel: "Loading...",
      forecastedOnDate: "N/A",
      
      // Tooltip data
      predictedSalesTooltip: "Predicted sales for the next 7 days",
      actualSalesTooltip: "Actual sales from the previous 7 days",
      forecastAccuracyTooltip: "Accuracy of forecast predictions",
      inventoryAlertsTooltip: "Items requiring immediate action",
      
      // Raw data for reference
      metrics: data.metrics || null
    };

    // 1. Predicted Sales (7 days forecast) - FIXED: Read from correct path
    if (data.metrics?.predicted_sales?.['7']) {
      const predicted = data.metrics.predicted_sales['7'];
      stats.predictedSales = predicted.total || 0;
      
      // Use start_date and end_date directly (already formatted as YYYY/MM/DD by backend)
      if (predicted.start_date && predicted.end_date) {
        stats.predictedSalesLabel = `Date: ${predicted.start_date} - ${predicted.end_date}`;
        stats.predictedSalesTooltip = `Forecasted sales from ${predicted.start_date} to ${predicted.end_date}`;
      } else if (predicted.label) {
        // Fallback: Use label if start_date/end_date not available
        stats.predictedSalesLabel = predicted.label;
        stats.predictedSalesTooltip = predicted.label;
      }
    }

    // 2. Actual Sales (7 days historical) - FIXED: Read from correct path
    if (data.metrics?.actual_sales) {
      const actual = data.metrics.actual_sales;
      stats.actualSales = actual.total || 0;
      
      // Use start_date and end_date directly (already formatted as YYYY/MM/DD by backend)
      if (actual.start_date && actual.end_date) {
        stats.actualSalesLabel = `Date: ${actual.start_date} - ${actual.end_date}`;
        stats.actualSalesTooltip = `Recorded sales from ${actual.start_date} to ${actual.end_date}`;
      } else if (actual.label) {
        // Fallback: Use label if start_date/end_date not available
        stats.actualSalesLabel = actual.label;
        stats.actualSalesTooltip = actual.label;
      }
    }

    // 3. Forecast Accuracy - Using wMAPE formula - FIXED
    if (data.metrics?.forecast_accuracy?.['7']) {
      const accuracy = data.metrics.forecast_accuracy['7'];
      
      if (accuracy.status === "available") {
        stats.forecastAccuracy = accuracy.accuracy_percent || 0;
        stats.forecastedOnDate = accuracy.forecasted_on || "N/A";
        
        // Calculate variance if we have the raw data
        if (data.stats?.variance !== undefined) {
          stats.variance = data.stats.variance;
        }
        
        stats.forecastAccuracyTooltip = `Forecast created on ${accuracy.forecasted_on || 'N/A'}. Variance: ${stats.variance >= 0 ? '+' : ''}${stats.variance}%`;
      } else {
        // Not available yet - use backend-provided stats as fallback
        if (data.stats) {
          stats.forecastAccuracy = data.stats.forecastAccuracy || 0;
          stats.variance = data.stats.variance || 0;
        }
        stats.forecastedOnDate = "N/A";
        stats.forecastAccuracyTooltip = accuracy.reason || "Forecast accuracy will be available after actual sales data is uploaded";
      }
    } else if (data.stats) {
      // Fallback to legacy stats structure
      stats.forecastAccuracy = data.stats.forecastAccuracy || 0;
      stats.variance = data.stats.variance || 0;
      stats.forecastedOnDate = "N/A";
    }

    // 4. Inventory Alerts (HIGH DEMAND items)
    if (data.inventoryAlerts) {
      stats.inventoryAlertsCount = data.inventoryAlerts.length;
      stats.inventoryAlertsTooltip = `${data.inventoryAlerts.length} items with HIGH demand need attention`;
    }

    return stats;
  }

  // Get accuracy color class
  static getAccuracyColorClass(accuracy) {
    if (accuracy >= 80) return "green";
    if (accuracy >= 60) return "yellow";
    return "red";
  }
}

function Navbar() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { stats, setStats } = useStats();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNavbarStats();
  }, []);

  const fetchNavbarStats = async () => {
    try {
      console.log("🔄 Navbar: Fetching stats (cached)...");

      const data = await SessionManager.getDashboardData(7, false);

      if (data.success) {
        // 🐛 DEBUG: Log the COMPLETE raw data structure
        console.log("📦 Raw backend response:", {
          success: data.success,
          metrics_exists: !!data.metrics,
          predicted_sales_7: data.metrics?.predicted_sales?.['7'],
          actual_sales: data.metrics?.actual_sales,
          forecast_accuracy_7: data.metrics?.forecast_accuracy?.['7'],
          stats: data.stats
        });

        const processedStats = NavbarStatsCalculator.processStats(data);
        
        // 🐛 DEBUG: Log the COMPLETE processed stats
        console.log("✅ Processed navbar stats:", processedStats);
        
        setStats(processedStats);
      } else {
        console.log("⚠️ Response not successful, using default stats");
      }

      setLoading(false);
    } catch (err) {
      console.error("❌ Error fetching navbar stats:", err);
      setLoading(false);
    }
  };

  // Format currency helper - matches your design exactly
  const formatCurrency = (value) => {
    if (value === 0) return "₱ 0";

    if (value >= 1000000) {
      return `₱ ${Math.floor(value / 1000000).toLocaleString("en-PH")},000,000`;
    } else if (value >= 1000) {
      return `₱ ${Math.floor(value / 1000).toLocaleString("en-PH")},000`;
    }
    return `₱ ${value.toLocaleString("en-PH")}`;
  };

  return (
    <nav className="navbar">
      <div className="navbar-top">
        <div className="logo">
          <FaBullseye className="logo-icon" />
          <span className="logo-text">Sales Forecasting System</span>
        </div>

        <ul className="navbar-links">
          <li>
            <NavLink to="/home">Home</NavLink>
          </li>
          <li>
            <NavLink to="/data">Data</NavLink>
          </li>
          <li>
            <NavLink to="/forecast">Forecast</NavLink>
          </li>
          <li>
            <NavLink to="/analytics">Analytics</NavLink>
          </li>
        </ul>

        <div className="navbar-right">
          <NotificationBell />

          <button className="settings" onClick={() => setIsSettingsOpen(true)}>
            <IoSettingsOutline />
          </button>

          <UserMenu />
        </div>
      </div>

      <br />
      <div className="clock-container">
        <Clock />
      </div>

      {/* Stats Section - Matches Design Exactly */}
      <div className="navbar-stats">
        {/* 1. Predicted Sales */}
        <div className="stat-item">
          <div className="stat-header">
            <h4>Predicted Sales</h4>
          </div>
          <p className="value">
            {loading ? "Loading..." : formatCurrency(stats.predictedSales)}
          </p>
          <span className="date-label">
            {loading ? "Loading..." : stats.predictedSalesLabel}
          </span>
        </div>

        <div className="divider"></div>

        {/* 2. Actual Sales */}
        <div className="stat-item">
          <div className="stat-header">
            <h4>Actual Sales</h4>
          </div>
          <p className="value">
            {loading ? "Loading..." : formatCurrency(stats.actualSales)}
          </p>
          <span className="date-label">
            {loading ? "Loading..." : stats.actualSalesLabel}
          </span>
        </div>

        <div className="divider"></div>

        {/* 3. Forecast Accuracy */}
        <div className="stat-item">
          <div className="stat-header">
            <h4>Forecast Accuracy</h4>
            <div className="info-icon-wrapper" title={stats.forecastAccuracyTooltip}>
              <IoInformationCircleOutline className="info-icon" />
            </div>
          </div>
          <p
            className={`value ${
              loading 
                ? "" 
                : NavbarStatsCalculator.getAccuracyColorClass(stats.forecastAccuracy)
            }`}
          >
            {loading ? "0%" : `${stats.forecastAccuracy}%`}
          </p>
          <span className="date-label">
            {loading 
              ? "Loading..." 
              : `Date: ${stats.forecastedOnDate}`}
          </span>
        </div>

        <div className="divider"></div>

        {/* 4. Inventory Alerts */}
        <div className="stat-item">
          <div className="stat-header">
            <h4>Inventory Alerts</h4>
            <div className="info-icon-wrapper" title={stats.inventoryAlertsTooltip}>
              <IoInformationCircleOutline className="info-icon" />
            </div>
          </div>
          <p
            className={`value ${
              stats.inventoryAlertsCount > 0 ? "red" : "green"
            }`}
          >
            {loading ? "0" : stats.inventoryAlertsCount}
          </p>
          <span className="date-label">items need action</span>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </nav>
  );
}

export default Navbar;