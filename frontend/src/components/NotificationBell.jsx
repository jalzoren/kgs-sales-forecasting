import { useState, useRef, useEffect } from "react";
import { FaBell, FaCog, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  const { notifications, markAsRead, unreadCount, removeNotification } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();
  const [removingIds, setRemovingIds] = useState([]);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Icon based on type
  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <FaCheckCircle className="notif-icon success" />;
      case "warning":
        return <FaExclamationTriangle className="notif-icon warning" />;
      case "info":
        return <FaInfoCircle className="notif-icon info" />;
      case "processing":
        return <FaCog className="notif-icon processing spin" />; // spinning icon
      default:
        return <FaInfoCircle className="notif-icon info" />;
    }
  };

  // Handle remove with slide animation
  const handleRemove = (id) => {
    setRemovingIds((prev) => [...prev, id]); // trigger CSS animation
    setTimeout(() => removeNotification(id), 300); // remove after animation
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button className="icon-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
        <FaBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          {notifications.length === 0 ? (
            <div className="notification-item empty">
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-item ${n.read ? "read" : "unread"} ${n.type} ${removingIds.includes(n.id) ? "slide-out" : ""}`}
                onClick={() => markAsRead(n.id)}
              >
                {/* Left icon + text */}
                <div className="notif-content">
                  <div className="notif-icon-wrapper">{getIcon(n.type)}</div>
                  <div className="notif-text">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-message">{n.message}</div>
                  </div>
                </div>

                {/* Time + close */}
                <div className="notif-meta">
                  <div className="notif-time">{n.time}</div>
                  <IoClose
                    className="close-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(n.id);
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
