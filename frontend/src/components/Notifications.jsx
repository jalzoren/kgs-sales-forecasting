// frontend/src/components/Notifications.jsx
import { createContext, useContext, useState, useCallback, useEffect } from "react";

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};

// Helper function to format time
const formatTime = (date) => {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  // Add a new notification
  const addNotification = useCallback((type, message) => {
    const newNotif = {
      id: Date.now() + Math.random(), // Unique ID
      type, // 'success', 'info', 'warning', 'error'
      message,
      time: formatTime(new Date()),
      timestamp: new Date(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    
    // Auto-update time display every minute
    return newNotif.id;
  }, []);

  // Convenience methods for each notification type
  const showSuccess = useCallback((message) => {
    return addNotification("success", message);
  }, [addNotification]);

  const showInfo = useCallback((message) => {
    return addNotification("info", message);
  }, [addNotification]);

  const showWarning = useCallback((message) => {
    return addNotification("warning", message);
  }, [addNotification]);

  const showError = useCallback((message) => {
    return addNotification("error", message);
  }, [addNotification]);

  // Mark notification as read
  const markAsRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, read: true }))
    );
  }, []);

  // Remove a notification
  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Update time display for all notifications
  const updateNotificationTimes = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notif) => ({
        ...notif,
        time: formatTime(notif.timestamp),
      }))
    );
  }, []);

  // Auto-update times every minute
  useEffect(() => {
    const interval = setInterval(updateNotificationTimes, 60000);
    return () => clearInterval(interval);
  }, [updateNotificationTimes]);

  const value = {
    notifications,
    addNotification,
    showSuccess,
    showInfo,
    showWarning,
    showError,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    unreadCount: notifications.filter((n) => !n.read).length,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;

