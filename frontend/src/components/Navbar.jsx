import { NavLink } from "react-router-dom";
import { FaBullseye, FaBell } from "react-icons/fa";
import { LiaUserCircle } from "react-icons/lia";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";

import "../css/Navbar.css";

function Navbar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You will be logged out!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0A4174",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, log out!",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire(
          "Logged Out!",
          "You have been successfully logged out.",
          "success"
        ).then(() => {
          navigate("/");
        });
      }
    });
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
          <button className="logout-btn" onClick={handleLogout}>
            <LiaUserCircle />
          </button>
        </div>
      </div>

      <br />

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
