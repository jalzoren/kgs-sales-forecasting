import { useState, useRef, useEffect, useMemo } from "react";
import {
  FaBell,
  FaCog,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimesCircle,
} from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    unreadCount,
    removeNotification,
    clearAll,
  } = useNotifications();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState(new Set());
  const [filter, setFilter] = useState("all"); // all, unread, read
  const dropdownRef = useRef();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    
    const handleEscape = (e) => {
      if (e.key === "Escape" && dropdownOpen) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [dropdownOpen]);

  // Choose icon based on type
  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <FaCheckCircle className="notif-icon success" />;
      case "warning":
        return <FaExclamationTriangle className="notif-icon warning" />;
      case "error":
        return <FaTimesCircle className="notif-icon error" />;
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
    setRemovingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      removeNotification(id);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  };

  // Group notifications by day
  const groupByDay = (notifs) => {
    const groups = {};
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    notifs.forEach((n) => {
      const ts =
        n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
      const notifDate = new Date(
        ts.getFullYear(),
        ts.getMonth(),
        ts.getDate()
      );
      const diffDays = Math.floor(
        (startOfToday - notifDate) / (1000 * 60 * 60 * 24)
      );

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

  // Filter notifications based on selected filter
  const filteredNotifications = useMemo(() => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read);
      case "read":
        return notifications.filter((n) => n.read);
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const groupedNotifications = useMemo(
    () => groupByDay(filteredNotifications),
    [filteredNotifications]
  );

  const handleToggleDropdown = () => {
    setDropdownOpen((prev) => !prev);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all notifications?")) {
      clearAll();
    }
  };

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button
        className="icon-btn"
        onClick={handleToggleDropdown}
        aria-label="Notifications"
        aria-expanded={dropdownOpen}
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          <div className="notif-header-section">
            <h3 className="title-notif">Notifications</h3>
            <div className="notif-actions">
              {unreadCount > 0 && (
                <button
                  className="action-btn"
                  onClick={handleMarkAllAsRead}
                  title="Mark all as read"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="action-btn danger"
                  onClick={handleClearAll}
                  title="Clear all notifications"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <p className="notif-numbers">
            You have <span>{unreadCount}</span>{" "}
            {unreadCount === 1 ? "unread notification" : "unread notifications"}
          </p>

          {/* Filter tabs */}
          {notifications.length > 0 && (
            <div className="notif-filters">
              <button
                className={`filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All ({notifications.length})
              </button>
              <button
                className={`filter-btn ${filter === "unread" ? "active" : ""}`}
                onClick={() => setFilter("unread")}
              >
                Unread ({unreadCount})
              </button>
              <button
                className={`filter-btn ${filter === "read" ? "active" : ""}`}
                onClick={() => setFilter("read")}
              >
                Read ({notifications.length - unreadCount})
              </button>
            </div>
          )}

          <div className="notif-list-container">
            {filteredNotifications.length === 0 ? (
              <div className="notification-item empty">
                <p>
                  {filter === "unread"
                    ? "No unread notifications"
                    : filter === "read"
                    ? "No read notifications"
                    : "No notifications"}
                </p>
              </div>
            ) : (
              Object.keys(groupedNotifications).map((dayLabel) => (
                <div key={dayLabel} className="notif-group">
                  <h4 className="notif-day">{dayLabel}</h4>
                  {groupedNotifications[dayLabel].map((n) => (
                    <div
                      key={n.id}
                      className={`notification-item ${n.read ? "read" : "unread"} ${
                        n.type
                      } ${removingIds.has(n.id) ? "slide-out" : ""}`}
                      onClick={() => !n.read && markAsRead(n.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !n.read) {
                          markAsRead(n.id);
                        }
                      }}
                    >
                      {/* Unread indicator dot */}
                      {!n.read && <div className="unread-dot" />}

                      {/* Left: Icon + Title + Message */}
                      <div className="notif-content">
                        <div className="notif-header">
                          <div className="notif-icon-wrapper">
                            {getIcon(n.type)}
                          </div>
                          <div className="notif-title">{n.title}</div>
                        </div>
                        <div className="notif-message">{n.message}</div>
                        
                        {/* Progress bar for processing notifications */}
                        {n.type === "processing" && typeof n.progress === "number" && (
                          <div className="progress-bar-container">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${Math.min(n.progress, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Right: Time + Close */}
                      <div className="notif-meta">
                        <div className="notif-time">{n.time}</div>
                        <button
                          className="close-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(n.id);
                          }}
                          aria-label="Remove notification"
                          title="Remove"
                        >
                          <IoClose className="close-icon" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}