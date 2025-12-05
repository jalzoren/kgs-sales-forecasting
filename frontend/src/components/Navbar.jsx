// frontend/src/components/Navbar.jsx
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FaBullseye } from "react-icons/fa";
import { IoSettingsOutline } from "react-icons/io5";
import Clock from "./Clock";
import NotificationBell from "./NotificationBell";
import SettingsModal from "./SettingsModal";
import UserMenu from "./UserMenu";
import "./components-css/Navbar.css";
import SessionManager from "../services/sessionManager";

function Navbar() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [stats, setStats] = useState({
    predictedSales: 0,
    actualSales: 0,
    forecastAccuracy: 0,
    inventoryAlertsCount: 0,
    variance: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      console.log("🔄 Fetching navbar stats...");

      const response = await fetch("http://localhost:5000/api/home/dashboard", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }

      const data = await response.json();
      console.log("📊 Navbar received data:", data);

      if (data.success) {
        const newStats = {
          predictedSales: data.stats?.predictedSales || 0,
          actualSales: data.stats?.actualSales || 0,
          forecastAccuracy: data.stats?.forecastAccuracy || 0,
          inventoryAlertsCount: data.inventoryAlerts?.length || 0,
          variance: data.stats?.variance || 0,
        };

        console.log("✅ Setting navbar stats:", newStats);
        setStats(newStats);

        // ✅ If we have forecast data, invalidate cache so next check gets fresh data
        if (data.forecastFile !== "N/A") {
          SessionManager.invalidateForecastCache();
        }
      } else {
        console.log("⚠️ Response not successful, using default stats");
      }

      setLoading(false);
    } catch (err) {
      console.error("❌ Error fetching navbar stats:", err);
      setLoading(false);
    }
  };

  // Format currency helper
  const formatCurrency = (value) => {
    if (value === 0) return "₱0";

    if (value >= 1000000) {
      return `₱${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `₱${(value / 1000).toFixed(0)}K`;
    }
    return `₱${value.toLocaleString("en-PH")}`;
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

      {/* Stats Section with Real Data */}
      <div className="navbar-stats">
        <div className="stat-item">
          <h4>Predicted Sales</h4>
          <p className="value">
            {loading ? "Loading..." : formatCurrency(stats.predictedSales)}
          </p>
          <span>next 7 days</span>
        </div>

        <div className="divider"></div>

        <div className="stat-item">
          <h4>Actual Sales</h4>
          <p className="value">
            {loading ? "Loading..." : formatCurrency(stats.actualSales)}
          </p>
          <span>previous 7 days</span>
        </div>

        <div className="divider"></div>

        <div className="stat-item">
          <h4>Forecast Accuracy</h4>
          <p
            className={`value ${
              stats.forecastAccuracy >= 80
                ? "green"
                : stats.forecastAccuracy >= 60
                ? "yellow"
                : "red"
            }`}
          >
            {loading ? "0%" : `${stats.forecastAccuracy}%`}
          </p>
          <span>
            variance:{" "}
            {stats.variance >= 0 ? `+${stats.variance}` : stats.variance}%
          </span>
        </div>

        <div className="divider"></div>

        <div className="stat-item">
          <h4>Inventory Alerts</h4>
          <p
            className={`value ${
              stats.inventoryAlertsCount > 0 ? "red" : "green"
            }`}
          >
            {loading ? "0" : stats.inventoryAlertsCount}
          </p>
          <span>items need action</span>
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