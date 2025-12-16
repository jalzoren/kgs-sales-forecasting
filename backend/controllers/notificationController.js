// backend/controllers/notificationController.js
const db = require("../config/db");

class NotificationController {
  // GET all notifications for current user
  getNotifications(req, res) {
    try {
      // Add validation
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;
      console.log("Fetching notifications for userId:", userId); // Debug log

      db.query(
        `SELECT notificationid as id, type, title, message, timestamp, isread as \`read\` 
         FROM notifications 
         WHERE userid = ? 
         ORDER BY timestamp DESC`,
        [userId],
        (err, notifications) => {
          if (err) {
            console.error("Error fetching notifications:", err);
            return res.status(500).json({ message: "Failed to fetch notifications" });
          }
          res.json(notifications);
        }
      );
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  }

  // POST - Create new notification
  createNotification(req, res) {
    const { type, title, message } = req.body;
    
    if (!type || !title || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      // Add validation
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;
      console.log("Creating notification for userId:", userId); // Debug log

      db.query(
        `INSERT INTO notifications (userid, type, title, message) VALUES (?, ?, ?, ?)`,
        [userId, type, title, message],
        (err, result) => {
          if (err) {
            console.error("Error creating notification:", err);
            return res.status(500).json({ message: "Failed to create notification" });
          }

          // Fetch the newly created notification
          db.query(
            `SELECT notificationid as id, type, title, message, timestamp, isread as \`read\` 
             FROM notifications WHERE notificationid = ?`,
            [result.insertId],
            (err, newNotif) => {
              if (err) {
                console.error("Error fetching new notification:", err);
                return res.status(500).json({ message: "Failed to fetch new notification" });
              }
              res.status(201).json(newNotif[0]);
            }
          );
        }
      );
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  }

  // PATCH - Mark notification as read
  markAsRead(req, res) {
    try {
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;

      db.query(
        `UPDATE notifications SET isread = 1 WHERE notificationid = ? AND userid = ?`,
        [req.params.id, userId],
        (err, result) => {
          if (err) {
            console.error("Error marking notification as read:", err);
            return res.status(500).json({ message: "Failed to update notification" });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Notification not found" });
          }

          res.json({ success: true });
        }
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to update notification" });
    }
  }

  // PATCH - Mark all notifications as read
  markAllAsRead(req, res) {
    try {
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;

      db.query(
        `UPDATE notifications SET isread = 1 WHERE userid = ?`,
        [userId],
        (err, result) => {
          if (err) {
            console.error("Error marking all as read:", err);
            return res.status(500).json({ message: "Failed to update notifications" });
          }
          res.json({ success: true });
        }
      );
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ message: "Failed to update notifications" });
    }
  }

  // DELETE - Remove single notification
  deleteNotification(req, res) {
    try {
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;

      db.query(
        `DELETE FROM notifications WHERE notificationid = ? AND userid = ?`,
        [req.params.id, userId],
        (err, result) => {
          if (err) {
            console.error("Error deleting notification:", err);
            return res.status(500).json({ message: "Failed to delete notification" });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Notification not found" });
          }

          res.json({ success: true });
        }
      );
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  }

  // DELETE - Clear all notifications
  clearAllNotifications(req, res) {
    try {
      if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.session.user.id;

      db.query(
        `DELETE FROM notifications WHERE userid = ?`,
        [userId],
        (err, result) => {
          if (err) {
            console.error("Error clearing notifications:", err);
            return res.status(500).json({ message: "Failed to clear notifications" });
          }
          res.json({ success: true });
        }
      );
    } catch (error) {
      console.error("Error clearing notifications:", error);
      res.status(500).json({ message: "Failed to clear notifications" });
    }
  }
}

module.exports = new NotificationController();