import { useState, useRef, useEffect } from "react";
import { FaBell, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaSpinner } from "react-icons/fa";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  const { history, markAsRead, unreadCount, markAllAsRead } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Separate notifications by today and yesterday
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
      case "success": return <FaCheckCircle />;
      case "warning": return <FaExclamationTriangle />;
      case "info": return <FaInfoCircle />;
      case "processing": return <FaSpinner className="spin" />;
      case "error": return <FaExclamationTriangle />;
      default: return <FaInfoCircle />;
    }
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button className="icon-btn" onClick={() => setDropdownOpen((prev) => !prev)}>
        <FaBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          <h4 className="notif-header">Notifications</h4>
          <button className="mark-all-read" onClick={markAllAsRead}>
            Mark all as read
          </button>

          {today.length > 0 && (
            <>
              <div className="notif-date-label">Today</div>
              {today.map((n) => (
                <div
                  key={n.id}
                  className={`notification-card ${n.type} ${n.read ? "read" : "unread"}`}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="notif-icon">{getIcon(n.type)}</div>
                  <div className="notif-content">
                    <div className="notif-title">{n.message.split("\n")[0]}</div>
                    <div className="notif-message">{n.message.split("\n").slice(1).join("\n")}</div>
                  </div>
                  <div className="notif-time">{n.time}</div>
                </div>
              ))}
            </>
          )}

          {yesterday.length > 0 && (
            <>
              <div className="notif-date-label">Yesterday</div>
              {yesterday.map((n) => (
                <div
                  key={n.id}
                  className={`notification-card ${n.type} ${n.read ? "read" : "unread"}`}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="notif-icon">{getIcon(n.type)}</div>
                  <div className="notif-content">
                    <div className="notif-title">{n.message.split("\n")[0]}</div>
                    <div className="notif-message">{n.message.split("\n").slice(1).join("\n")}</div>
                  </div>
                  <div className="notif-time">{n.time}</div>
                </div>
              ))}
            </>
          )}

          {history.length === 0 && <div className="notification-empty">No notifications</div>}
        </div>
      )}
    </div>
  );
}
