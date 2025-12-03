// frontend/src/components/Navbar.jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FaBullseye } from "react-icons/fa";
import { IoSettingsOutline } from "react-icons/io5";
import Clock from "./Clock";
import NotificationBell from "./NotificationBell";
import SettingsModal from "./SettingsModal";
import UserMenu from "./UserMenu";
import "./components-css/Navbar.css";

function Navbar() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-top">
        <div className="logo">
          <FaBullseye className="logo-icon" />
          <span className="logo-text">Sales Forecasting System</span>
        </div>

        <ul className="navbar-links">
          <li><NavLink to="/home">Home</NavLink></li>
          <li><NavLink to="/data">Data</NavLink></li>
          <li><NavLink to="/forecast">Forecast</NavLink></li>
          <li><NavLink to="/analytics">Analytics</NavLink></li>
        </ul>

        <div className="navbar-right">
          <NotificationBell />
          
          <button 
            className="icon-btn-circle glass" 
            onClick={() => setIsSettingsOpen(true)}
          >
            <IoSettingsOutline />
          </button>

          <UserMenu />
        </div>
      </div>

      <br />
      <div className="clock-container">
        <Clock />
      </div>

      <div className="navbar-stats">
        <div className="stat-item">
          <h4>Predicted Sales</h4>
          <p className="value">0</p>
          <span>next 7 days</span>
        </div>
        <div className="divider"></div>
        <div className="stat-item">
          <h4>Actual Sales</h4>
          <p className="value">0</p>
          <span>previous 7 days</span>
        </div>
        <div className="divider"></div>
        <div className="stat-item">
          <h4>Forecast Accuracy</h4>
          <p className="value green">0</p>
          <span>variance: 7%</span>
        </div>
        <div className="divider"></div>
        <div className="stat-item">
          <h4>Inventory Alerts</h4>
          <p className="value red">0</p>
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