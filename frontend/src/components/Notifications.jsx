import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
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

// Safe localStorage operations with error handling
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error writing to localStorage (${key}):`, error);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage (${key}):`, error);
    }
  },
};

export const NotificationProvider = ({ children }) => {
  const timeoutRefs = useRef(new Map());

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
    } catch (error) {
      console.error("Error parsing notifications:", error);
      return [];
    }
  };

  const [notifications, setNotifications] = useState(() => {
    const saved = safeLocalStorage.getItem("notifications");
    return reviveItems(saved);
  });

  const [history, setHistory] = useState(() => {
    const saved = safeLocalStorage.getItem("notificationHistory");
    return reviveItems(saved);
  });

  const saveState = useCallback((key, value) => {
    safeLocalStorage.setItem(key, JSON.stringify(value));
  }, []);

  const typeToTitle = {
    success: "Success",
    info: "Info",
    warning: "Warning",
    error: "Error",
    processing: "Processing",
  };

  // Base function to add any notification
  const addNotification = useCallback(
    (type, message, title, extraProps = {}) => {
      const newNotif = {
        id: Date.now() + Math.random(),
        type,
        title: title || typeToTitle[type] || "Notification",
        message,
        timestamp: new Date(),
        time: formatTime(new Date()),
        read: false,
        ...extraProps,
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
    },
    [saveState]
  );

  // Convenience methods for different notification types
  const showSuccess = useCallback(
    (msg, title) => addNotification("success", msg, title),
    [addNotification]
  );

  const showInfo = useCallback(
    (msg, title) => addNotification("info", msg, title),
    [addNotification]
  );

  const showWarning = useCallback(
    (msg, title) => addNotification("warning", msg, title),
    [addNotification]
  );

  const showError = useCallback(
    (msg, title) => addNotification("error", msg, title),
    [addNotification]
  );

  // Processing notification with auto-completion
  const showProcessing = useCallback(
    (msg, title, duration = 5000) => {
      const id = addNotification("processing", msg, title, { progress: 0 });

      // Clear any existing timeout for this ID
      if (timeoutRefs.current.has(id)) {
        clearTimeout(timeoutRefs.current.get(id));
      }

      // Set timeout to auto-complete
      const timeoutId = setTimeout(() => {
        updateNotification(id, {
          type: "success",
          message: "Processing completed",
          time: formatTime(new Date()),
        });
        timeoutRefs.current.delete(id);
      }, duration);

      timeoutRefs.current.set(id, timeoutId);

      return id;
    },
    [addNotification]
  );

  // Progress-based processing notification
  const showProgress = useCallback(
    (message, initialProgress = 0, title) => {
      return addNotification("processing", message, title, {
        progress: initialProgress,
      });
    },
    [addNotification]
  );

  // Update notification content
  const updateNotification = useCallback(
    (id, updates) => {
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n.id === id
            ? {
                ...n,
                ...updates,
                timestamp: updates.timestamp || n.timestamp,
                time: updates.time || formatTime(n.timestamp),
              }
            : n
        );
        saveState("notifications", updated);
        return updated;
      });

      setHistory((prev) => {
        const updatedHistory = prev.map((n) =>
          n.id === id
            ? {
                ...n,
                ...updates,
                timestamp: updates.timestamp || n.timestamp,
                time: updates.time || formatTime(n.timestamp),
              }
            : n
        );
        saveState("notificationHistory", updatedHistory);
        return updatedHistory;
      });

      // Clear timeout if converting from processing
      if (updates.type && updates.type !== "processing") {
        if (timeoutRefs.current.has(id)) {
          clearTimeout(timeoutRefs.current.get(id));
          timeoutRefs.current.delete(id);
        }
      }
    },
    [saveState]
  );

  // Update progress for a notification
  const updateProgress = useCallback(
    (id, progress) => {
      updateNotification(id, { progress: Math.min(Math.max(progress, 0), 100) });
    },
    [updateNotification]
  );

  // Mark single notification as read
  const markAsRead = useCallback(
    (id) => {
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
        saveState("notifications", updated);
        return updated;
      });

      setHistory((prev) => {
        const updatedHistory = prev.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
        saveState("notificationHistory", updatedHistory);
        return updatedHistory;
      });
    },
    [saveState]
  );

  // Mark all notifications as read
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
  }, [saveState]);

  // Remove a notification
  const removeNotification = useCallback(
    (id) => {
      // Clear any timeout associated with this notification
      if (timeoutRefs.current.has(id)) {
        clearTimeout(timeoutRefs.current.get(id));
        timeoutRefs.current.delete(id);
      }

      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== id);
        saveState("notifications", updated);
        return updated;
      });

      // Keep in history
      // If you want to remove from history too, uncomment below:
      // setHistory((prev) => {
      //   const updatedHistory = prev.filter((n) => n.id !== id);
      //   saveState("notificationHistory", updatedHistory);
      //   return updatedHistory;
      // });
    },
    [saveState]
  );

  // Clear all notifications
  const clearAll = useCallback(() => {
    // Clear all timeouts
    timeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutRefs.current.clear();

    setNotifications([]);
    safeLocalStorage.removeItem("notifications");
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    safeLocalStorage.removeItem("notificationHistory");
  }, []);

  // Keep relative time updated every minute
  const updateNotificationTimes = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => {
        const ts =
          n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
        return { ...n, timestamp: ts, time: formatTime(ts) };
      });
      saveState("notifications", updated);
      return updated;
    });

    setHistory((prev) => {
      const updatedHistory = prev.map((n) => {
        const ts =
          n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp);
        return { ...n, timestamp: ts, time: formatTime(ts) };
      });
      saveState("notificationHistory", updatedHistory);
      return updatedHistory;
    });
  }, [saveState]);

  useEffect(() => {
    const interval = setInterval(updateNotificationTimes, 60000);
    return () => clearInterval(interval);
  }, [updateNotificationTimes]);

  // Auto-convert processing notifications with progress >= 100 to success
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) => {
        let hasChanges = false;
        const updated = prev.map((n) => {
          if (
            n.type === "processing" &&
            typeof n.progress === "number" &&
            n.progress >= 100
          ) {
            hasChanges = true;
            return {
              ...n,
              type: "success",
              message: "Processing completed",
              time: formatTime(new Date()),
            };
          }
          return n;
        });

        if (hasChanges) {
          saveState("notifications", updated);
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [saveState]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutRefs.current.clear();
    };
  }, []);

  const contextValue = {
    notifications,
    history,
    addNotification,
    showSuccess,
    showInfo,
    showWarning,
    showError,
    showProgress,
    showProcessing,
    updateNotification,
    updateProgress,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    clearHistory,
    unreadCount: notifications.filter((n) => !n.read).length,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;