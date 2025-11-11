import { useState, useRef, useEffect } from "react";
import { FaBell } from "react-icons/fa";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css";

export default function NotificationBell() {
  const { history, markAsRead, unreadCount, markAllAsRead } = useNotifications();
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

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button
        className="icon-btn"
        onClick={() => setDropdownOpen((prev) => !prev)}
      >
        <FaBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {dropdownOpen && (
        <div className="notifications-dropdown">
          {history.length === 0 ? (
            <div className="notification-item info">
              <p>No notifications</p>
            </div>
          ) : (
            <>
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all as read
              </button>
              <div className="notifications-list">
                {history.map((n) => (
                  <div
                    key={n.id}
                    className={`notification-item ${n.read ? "read" : "unread"} ${n.type}`}
                    onClick={() => markAsRead(n.id)}
                  >
                    <p className="message">{n.message}</p>
                    <span className="time">{n.time}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
