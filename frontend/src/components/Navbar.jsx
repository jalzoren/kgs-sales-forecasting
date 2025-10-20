import { NavLink } from "react-router-dom";
import { FaBullseye, FaBell } from "react-icons/fa";
import { LiaUserCircle } from "react-icons/lia";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import "../css/Navbar.css";

// Example notifications data
const notificationsData = [
  { message: "Inventory Alert: Item X low stock", time: "2h ago", read: false },
  { message: "Sales forecast updated", time: "5h ago", read: false },
  { message: "New report available", time: "1d ago", read: true },
  { message: "Forecast accuracy variance: 7%", time: "2d ago", read: true },
  { message: "Predicted sales updated", time: "3d ago", read: true },
  { message: "Inventory Alert: Item Y low stock", time: "4d ago", read: false },
];

function Navbar() {
  const navigate = useNavigate();
  const [notifications] = useState(notificationsData);
  const [dropdownOpen, setDropdownOpen] = useState(false);


 const handleLogout = () => {
     Swal.fire({
       title: "Are you sure?",
       text: "You will be logged out!",
       icon: "warning",
       showCancelButton: true,
       confirmButtonColor: "#0A4174",
       cancelButtonColor: "#d33",
       confirmButtonText: "Yes, log out!",
       toast: true,
       position: "top",
     }).then((result) => {
       if (result.isConfirmed) {
         Swal.fire({
           toast: true,
           position: "top",
           icon: "success",
           title: "Logged out successfully!",
           showConfirmButton: false,
           timer: 500,
           timerProgressBar: true,
         }).then(() => {
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
          <li><NavLink to="/home">Home</NavLink></li>
          <li><NavLink to="/data">Data</NavLink></li>
          <li><NavLink to="/forecast">Forecast</NavLink></li>
          <li><NavLink to="/reports">Reports</NavLink></li>
          <li><NavLink to="/analytics">Analytics</NavLink></li>
        </ul>

        <div className="navbar-right">
          <div className="notification-wrapper">
            <button className="icon-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <FaBell />
            </button>

            {dropdownOpen && (
              <div className="notifications-dropdown">
                {notifications.slice(0, 5).map((n, i) => (
                  <div key={i} className={`notification-item ${n.read ? "" : "unread"}`}>
                    <p>{n.message}</p>
                    <span>{n.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
