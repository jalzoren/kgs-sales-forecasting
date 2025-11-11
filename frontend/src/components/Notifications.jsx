import { createContext, useContext, useState, useCallback, useEffect } from "react";

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};


// Format relative time
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
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem("notifications");
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("notificationHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const saveState = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const addNotification = useCallback((type, message) => {
    const newNotif = {
      id: Date.now() + Math.random(),
      type, // success, info, warning, error, processing
      message,
      timestamp: new Date(),
      time: formatTime(new Date()),
      read: false,
    };
    setNotifications((prev) => {
      const updated = [newNotif, ...prev];
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = [newNotif, ...prev];
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
    return newNotif.id;
  }, []);

  const showSuccess = useCallback((msg) => addNotification("success", msg), [addNotification]);
  const showInfo = useCallback((msg) => addNotification("info", msg), [addNotification]);
  const showWarning = useCallback((msg) => addNotification("warning", msg), [addNotification]);
  const showError = useCallback((msg) => addNotification("error", msg), [addNotification]);
  const showProcessing = useCallback((msg) => addNotification("processing", msg), [addNotification]);

  // Progress notification
  const showProgress = useCallback((message, initialProgress = 0) => {
    const id = Date.now() + Math.random();
    const notif = {
      id,
      type: "processing",
      message,
      timestamp: new Date(),
      time: formatTime(new Date()),
      read: false,
      progress: initialProgress,
    };
    setNotifications((prev) => {
      const updated = [notif, ...prev];
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = [notif, ...prev];
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
    return id;
  }, []);

  const updateNotification = useCallback((id, updates) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, ...updates } : n));
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.map((n) => (n.id === id ? { ...n, ...updates } : n));
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.map((n) => ({ ...n, read: true }));
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.filter((n) => n.id !== id);
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setHistory([]);
    localStorage.removeItem("notifications");
    localStorage.removeItem("notificationHistory");
  }, []);

  const updateNotificationTimes = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, time: formatTime(n.timestamp) }));
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.map((n) => ({ ...n, time: formatTime(n.timestamp) }));
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateNotificationTimes, 60000);
    return () => clearInterval(interval);
  }, [updateNotificationTimes]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        history,
        addNotification,
        showSuccess,
        showInfo,
        showWarning,
        showError,
        showProgress,
        updateNotification,
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
