// backend/routes/homeRoutes.js
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware.js");
const homeController = require("../controllers/homeController");

/**
 * GET /api/home/dashboard
 * Get dashboard data combining sales, forecasts, and future predictions
 */
router.get("/api/home/dashboard", requireAuth, (req, res) => {
  homeController.getDashboard(req, res);
});

module.exports = router;