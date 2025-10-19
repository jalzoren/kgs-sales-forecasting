import { NavLink } from "react-router-dom";
import { FaBullseye, FaBell } from "react-icons/fa";
import { LiaUserCircle } from "react-icons/lia";
import "../css/Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-top">
        <div className="logo">
          <div className="logo">
            <FaBullseye className="logo-icon" />
            <span className="logo-text">Sales Forecasting System</span>
          </div>
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
            <NavLink to="/reports">Reports</NavLink>
          </li>
          <li>
            <NavLink to="/analytics">Analytics</NavLink>
          </li>
        </ul>

        <div className="navbar-right">
          <button className="icon-btn">
            <FaBell />
          </button>
          <button className="logout-btn">
            
            <LiaUserCircle />

          </button>
        </div>
      </div>

      <br></br>

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
    </nav>
  );
}

export default Navbar;
