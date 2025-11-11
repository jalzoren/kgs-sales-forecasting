// frontend/src/components/Navbar2.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { FaBullseye, FaBell } from "react-icons/fa";
import { LiaUserCircle } from "react-icons/lia";
import Swal from "sweetalert2";
import { useState } from "react";
import { useNotifications } from "./Notifications";

import "../components/components-css/Navbar2.css";

function Navbar2() {
  const navigate = useNavigate();
  const { notifications, markAsRead } = useNotifications();
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
    <nav className="navbar2">
      <div className="navbar2-top">
        <div className="logo">
          <FaBullseye className="logo-icon" />
          <span className="logo-text">Sales Forecasting System</span>
        </div>

        <ul className="navbar2-links">
          <li><NavLink to="/home">Home</NavLink></li>
          <li><NavLink to="/data">Data</NavLink></li>
          <li><NavLink to="/forecast">Forecast</NavLink></li>
          <li><NavLink to="/reports">Reports</NavLink></li>
          <li><NavLink to="/analytics">Analytics</NavLink></li>
        </ul>

        <div className="navbar2-right">
          <div className="notification-wrapper">
            <button className="icon-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <FaBell />
            </button>

            {dropdownOpen && (
              <div className="notifications-dropdown">
                {notifications.length === 0 ? (
                  <div className="notification-item">
                    <p>No notifications</p>
                  </div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={`notification-item ${n.read ? "" : "unread"} ${n.type}`}
                      onClick={() => markAsRead(n.id)}
                    >
                      <p>{n.message}</p>
                      <span>{n.time}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <button className="logout-btn" onClick={handleLogout}>
            <LiaUserCircle />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar2;
