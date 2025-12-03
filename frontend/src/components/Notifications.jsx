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

const API_URL = "http://localhost:5000/api/notifications";

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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch notifications from backend
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(API_URL, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        const formatted = data.map((n) => ({
          ...n,
          timestamp: new Date(n.timestamp),
          time: formatTime(new Date(n.timestamp)),
        }));
        setNotifications(formatted);
        setHistory(formatted);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const typeToTitle = {
    success: "Success",
    info: "Info",
    warning: "Warning",
    error: "Error",
    processing: "Processing",
  };

  const addNotification = useCallback(async (type, message, title) => {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          title: title || typeToTitle[type] || "Notification",
          message,
        }),
      });

      if (response.ok) {
        const newNotif = await response.json();
        const formatted = {
          ...newNotif,
          timestamp: new Date(newNotif.timestamp),
          time: formatTime(new Date(newNotif.timestamp)),
        };
        
        setNotifications((prev) => [formatted, ...prev]);
        setHistory((prev) => [formatted, ...prev]);
        return formatted.id;
      }
    } catch (error) {
      console.error("Error adding notification:", error);
    }
  }, []);

  const showSuccess = useCallback((msg, title) => addNotification("success", msg, title), [addNotification]);
  const showInfo = useCallback((msg, title) => addNotification("info", msg, title), [addNotification]);
  const showWarning = useCallback((msg, title) => addNotification("warning", msg, title), [addNotification]);
  const showError = useCallback((msg, title) => addNotification("error", msg, title), [addNotification]);

  const showProcessing = useCallback((msg, title, duration = 5000) => {
    const id = addNotification("processing", msg, title);
    
    setTimeout(async () => {
      try {
        await fetch(`${API_URL}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: "Done Processed", type: "success" }),
        });
        fetchNotifications();
      } catch (error) {
        console.error("Error updating notification:", error);
      }
    }, duration);

    return id;
  }, [addNotification, fetchNotifications]);

  const markAsRead = useCallback(async (id) => {
    try {
      await fetch(`${API_URL}/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setHistory((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch(`${API_URL}/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
      
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setHistory((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }, []);

  const removeNotification = useCallback(async (id) => {
    try {
      await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setHistory((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error("Error removing notification:", error);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await fetch(API_URL, {
        method: "DELETE",
        credentials: "include",
      });
      
      setNotifications([]);
      setHistory([]);
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
  }, []);

  // Update times every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          time: formatTime(n.timestamp),
        }))
      );
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        history,
        loading,
        addNotification,
        showSuccess,
        showInfo,
        showWarning,
        showError,
        showProcessing,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        unreadCount: notifications.filter((n) => !n.read).length,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;