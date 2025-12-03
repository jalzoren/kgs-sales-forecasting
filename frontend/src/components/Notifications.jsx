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

// Format relative time (1m ago, etc.)
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
  const reviveItems = (raw) => {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed)
        ? parsed.map((n) => {
            const ts = n.timestamp ? new Date(n.timestamp) : new Date();
            return {
              ...n,
              timestamp: ts,
              time: formatTime(ts),
            };
          })
        : [];
    } catch {
      return [];
    }
  };

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem("notifications");
    return reviveItems(saved);
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("notificationHistory");
    return reviveItems(saved);
  });

  const saveState = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const typeToTitle = {
    success: "Success",
    info: "Info",
    warning: "Warning",
    error: "Error",
    processing: "Processing",
  };

  const addNotification = useCallback((type, message, title) => {
    const newNotif = {
      id: Date.now() + Math.random(),
      type,
      title: title || typeToTitle[type] || "Notification",
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

  const showSuccess = useCallback((msg, title) => addNotification("success", msg, title), [addNotification]);
  const showInfo = useCallback((msg, title) => addNotification("info", msg, title), [addNotification]);
  const showWarning = useCallback((msg, title) => addNotification("warning", msg, title), [addNotification]);
  const showError = useCallback((msg, title) => addNotification("error", msg, title), [addNotification]);

  // 🌀 Show processing notification that auto-completes after delay
  const showProcessing = useCallback((msg, title, duration = 5000) => {
    const id = Date.now() + Math.random();
    const notif = {
      id,
      type: "processing",
      title: title || typeToTitle.processing,
      message: msg,
      timestamp: new Date(),
      time: formatTime(new Date()),
      read: false,
      progress: 0,
    };

    // Add it to notifications
    setNotifications((prev) => {
      const updated = [notif, ...prev];
      localStorage.setItem("notifications", JSON.stringify(updated));
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = [notif, ...prev];
      localStorage.setItem("notificationHistory", JSON.stringify(updatedHistory));
      return updatedHistory;
    });

    // ✅ Auto-complete after duration (default 5 seconds)
    setTimeout(() => {
      updateNotification(id, {
        type: "success",
        message: "Done Processed",
        time: formatTime(new Date()),
      });
    }, duration);

    return id;
  }, []);

  // Progress-based processing notification
  const showProgress = useCallback((message, initialProgress = 0, title) => {
    const id = Date.now() + Math.random();
    const notif = {
      id,
      type: "processing",
      title: title || typeToTitle.processing,
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

  // 🔁 Update notification content
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

  // 🕒 Keep relative time updated
  const updateNotificationTimes = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => {
        const ts = n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
        return { ...n, timestamp: ts, time: formatTime(ts) };
      });
      saveState("notifications", updated);
      return updated;
    });
    setHistory((prev) => {
      const updatedHistory = prev.map((n) => {
        const ts = n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
        return { ...n, timestamp: ts, time: formatTime(ts) };
      });
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateNotificationTimes, 60000);
    return () => clearInterval(interval);
  }, [updateNotificationTimes]);

  // ✅ Auto-convert processing notifications with progress=100 → Done Processed
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (n.type === "processing" && n.progress >= 100) {
            return {
              ...n,
              type: "success",
              message: "Done Processed",
              time: formatTime(new Date()),
            };
          }
          return n;
        });
        saveState("notifications", updated);
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
