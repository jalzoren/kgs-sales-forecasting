import { useState, useRef, useEffect } from "react";
import {
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaSpinner,
} from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  
  const { history, markAsRead, unreadCount, markAllAsRead } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  // ✅ Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ Separate notifications by today/yesterday
  const today = [];
  const yesterday = [];
  const now = new Date();

  history.forEach((n) => {
    const notifDate = new Date(n.timestamp);
    const diffDays = Math.floor((now - notifDate) / (1000 * 60 * 60 * 24));
    if (diffDays < 1) today.push(n);
    else yesterday.push(n);
  });

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <FaCheckCircle className="notif-icon success" />;
      case "warning":
        return <FaExclamationTriangle className="notif-icon warning" />;
      case "info":
        return <FaInfoCircle className="notif-icon info" />;
      case "processing":
        return <FaSpinner className="notif-icon spin info" />;
      case "error":
        return <FaExclamationTriangle className="notif-icon error" />;
      default:
        return <FaInfoCircle className="notif-icon info" />;
    }
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      {/* 🔔 Notification Bell */}
      <button
        className="icon-btn"
        onClick={() => setDropdownOpen((prev) => !prev)}
      >
        <FaBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {/* 📜 Dropdown */}
      {dropdownOpen && (
        <div className="notifications-dropdown">
          <div className="notif-header-row">
            <h4 className="notif-header">Notifications</h4>
            {history.length > 0 && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>

          {/* 🟢 Today Section */}
          {today.length > 0 && (
            <>
              <div className="notif-date-label">Today</div>
              {today.map((n) => (
                <NotificationCard key={n.id} n={n} markAsRead={markAsRead} getIcon={getIcon} />
              ))}
            </>
          )}

          {/* 🟢 Yesterday Section */}
          {yesterday.length > 0 && (
            <>
              <div className="notif-date-label">Yesterday</div>
              {yesterday.map((n) => (
                <NotificationCard key={n.id} n={n} markAsRead={markAsRead} getIcon={getIcon} />
              ))}
            </>
          )}

          {/* Empty State */}
          {history.length === 0 && (
            <div className="notification-empty">No notifications</div>
          )}
        </div>
      )}
    </div>
  );
}

// ✅ Separate Notification Card Component
function NotificationCard({ n, markAsRead, getIcon }) {
  return (
    <div
      className={`notification-card-new ${n.type}`}
      onClick={() => markAsRead(n.id)}
    >
      <div className="card-header">
        <div className="card-header-left">
          {getIcon(n.type)}
          <span className="card-title">{n.message.split("\n")[0]}</span>
          <span className="card-time">{n.time}</span>
        </div>
        <IoClose className="card-close" />
      </div>
      <div className="card-body">
        {n.message.split("\n").slice(1).join("\n")}
      </div>
    </div>
  );
}
