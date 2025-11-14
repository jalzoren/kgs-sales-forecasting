import { useEffect } from "react";
import { useNotifications } from "./Notifications";

const API_BASE = "http://127.0.0.1:8000"; // Change only if backend is elsewhere

export default function NotificationSSE() {
  const { showProgress, updateNotification, showSuccess, showError } = useNotifications();

  useEffect(() => {
    // Get user ID (you probably have this in auth or localStorage after login)
    const userId = localStorage.getItem("userId") || "1";

    const eventSource = new EventSource(`${API_BASE}/api/notifications/${userId}`);

    let currentTrainingId = null;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip initial connection message
        if (data.type === "connected") return;

        // Handle live progress
        if (data.type === "processing") {
          if (data.progress !== undefined) {
            if (!currentTrainingId) {
              currentTrainingId = showProgress(
                data.message || "Training model...",
                data.progress,
                data.title || "Model Training"
              );
            } else {
              updateNotification(currentTrainingId, {
                message: data.message,
                title: data.title,
                progress: data.progress,
              });
            }
          }
        }

        // Training completed
        else if (data.type === "success") {
          if (currentTrainingId) {
            updateNotification(currentTrainingId, {
              type: "success",
              title: data.title || "Training Complete!",
              message: data.message || "Your model is ready!",
              progress: 100,
            });
            currentTrainingId = null;
          } else {
            showSuccess(data.message || "Training completed!", data.title);
          }
        }

        // Error
        else if (data.type === "error") {
          if (currentTrainingId) {
            updateNotification(currentTrainingId, {
              type: "error",
              title: data.title || "Training Failed",
              message: data.message,
            });
            currentTrainingId = null;
          } else {
            showError(data.message, data.title);
          }
        }
      } catch (err) {
        console.error("SSE message error:", err);
      }
    };

    eventSource.onerror = () => {
      console.warn("SSE disconnected. Will reconnect automatically...");
      // Browser auto-reconnects EventSource
    };

    return () => {
      eventSource.close();
    };
  }, [showProgress, updateNotification, showSuccess, showError]);

  return null; // Invisible component
}