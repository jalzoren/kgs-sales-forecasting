// frontend/src/components/NotificationDropdown.jsx
import { useState, useRef, useEffect } from "react";
import { FaBell } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNotifications } from "./Notifications";
import "../components/components-css/NotificationBell.css"; // use the same CSS

export default function NotificationDropdown() {
  const { notifications, markAsRead } = useNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  // Close dropdown if clicking outside
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
      <button className="icon-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
        <FaBell />
        {notifications.some((n) => !n.read) && <span className="notif-badge">
          {notifications.filter((n) => !n.read).length}
        </span>}
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
              >
                <p>{n.message}</p>
                <span>{n.time}</span>
                <IoClose className="close-icon" onClick={() => markAsRead(n.id)} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
