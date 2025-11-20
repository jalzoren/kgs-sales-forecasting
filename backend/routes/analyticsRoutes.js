const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware.js");
const analyticsController = require("../controllers/analyticsController");

/**
 * GET /api/forecast/analytics
 * Get parsed forecast data for analytics visualization
 * Query params: horizon (7d, 30d, 90d)
 */
router.get("/api/forecast/analytics", requireAuth, (req, res) => {
  analyticsController.getAnalytics(req, res);
});

module.exports = router;