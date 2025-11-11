import { useState, useRef, useEffect } from "react";
import { FaBell, FaCog, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationDropdown() {
  const { notifications, markAsRead } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <FaCheckCircle className="notif-icon success" />;
      case "warning":
        return <FaExclamationTriangle className="notif-icon warning" />;
      case "info":
        return <FaInfoCircle className="notif-icon info" />;
      case "processing":
        return <FaCog className="notif-icon processing" />;
      default:
        return <FaInfoCircle className="notif-icon info" />;
    }
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button className="icon-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
        <FaBell />
        {notifications.some((n) => !n.read) && (
          <span className="notif-badge">
            {notifications.filter((n) => !n.read).length}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          {notifications.length === 0 ? (
            <div className="notification-item">
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-item ${n.read ? "" : "unread"} ${n.type}`}
                onClick={() => markAsRead(n.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                }}
              >
                {/* Left icon */}
                <div style={{ marginRight: "10px" }}>{getIcon(n.type)}</div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>
                    {n.title || "Data Processing"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#555" }}>{n.message}</div>
                </div>

                {/* Time & close */}
                <div style={{ marginLeft: "10px", textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "#999" }}>{n.time}</div>
                  <IoClose
                    className="close-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(n.id);
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
