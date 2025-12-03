// backend/routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { requireAuth } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(requireAuth);

// GET all notifications
router.get("/", notificationController.getNotifications);

// POST create notification
router.post("/", notificationController.createNotification);

// PATCH mark as read
router.patch("/:id/read", notificationController.markAsRead);

// PATCH mark all as read
router.patch("/read-all", notificationController.markAllAsRead);

// DELETE single notification
router.delete("/:id", notificationController.deleteNotification);

// DELETE all notifications
router.delete("/", notificationController.clearAllNotifications);

module.exports = router;