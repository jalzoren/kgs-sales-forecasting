import { useState, useRef, useEffect } from "react";
import {
  FaBell,
  FaCog,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
} from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  const { notifications, markAsRead, unreadCount, removeNotification } =
    useNotifications();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState([]);
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

  // Choose icon based on type
  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <FaCheckCircle className="notif-icon success" />;
      case "warning":
        return <FaExclamationTriangle className="notif-icon warning" />;
      case "info":
        return <FaInfoCircle className="notif-icon info" />;
      case "processing":
        return <FaCog className="notif-icon processing spin" />;
      default:
        return <FaInfoCircle className="notif-icon info" />;
    }
  };

  // Animate and remove notification
  const handleRemove = (id) => {
    setRemovingIds((prev) => [...prev, id]);
    setTimeout(() => removeNotification(id), 300);
  };

  // ✅ Group notifications by day (does NOT mutate timestamps)
  const groupByDay = (notifs) => {
    const groups = {};
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    notifs.forEach((n) => {
      const ts = n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
      const notifDate = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
      const diffDays = Math.floor((startOfToday - notifDate) / (1000 * 60 * 60 * 24));

      let label;
      if (diffDays === 0) label = "Today";
      else if (diffDays === 1) label = "Yesterday";
      else if (diffDays < 7)
        label = ts.toLocaleDateString("en-US", { weekday: "long" });
      else
        label = ts.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

      if (!groups[label]) groups[label] = [];
      groups[label].push(n);
    });

    return groups;
  };

  const groupedNotifications = groupByDay(notifications);

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button
        className="icon-btn"
        onClick={() => setDropdownOpen(!dropdownOpen)}
      >
        <FaBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          <h3 className="title-notif">Notifications</h3>
          <p className="notif-numbers">
            You have <span>{unreadCount}</span>{" "}
            {unreadCount === 1 ? "notification" : "notifications"}
          </p>

          {notifications.length === 0 ? (
            <div className="notification-item empty">
              <p>No notifications</p>
            </div>
          ) : (
            Object.keys(groupedNotifications).map((dayLabel) => (
              <div key={dayLabel}>
                <h4 className="notif-day">{dayLabel}</h4>
                {groupedNotifications[dayLabel].map((n) => {
                  const ts = n.timestamp instanceof Date
                    ? n.timestamp
                    : new Date(n.timestamp);

                  return (
                    <div
                      key={n.id}
                      className={`notification-item ${n.read ? "read" : "unread"} ${n.type} ${
                        removingIds.includes(n.id) ? "slide-out" : ""
                      }`}
                      onClick={() => markAsRead(n.id)}
                    >
                      {/* Left: Icon + Title + Message */}
                      <div className="notif-content">
                        <div className="title-head">
                          <div className="notif-header">
                            <div className="notif-icon-wrapper">
                              {getIcon(n.type)}
                            </div>
                            <div className="notif-title">{n.title}</div>
                          </div>
                        </div>
                        <div className="notif-message">{n.message}</div>
                      </div>

                      {/* Right: Time + Close */}
                      <div className="notif-meta">
                        <div className="notif-time">
                          {ts.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <IoClose
                          className="close-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(n.id);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
