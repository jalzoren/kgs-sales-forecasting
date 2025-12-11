// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const sessionConfig = require("./config/sessionConfig");

// Database
const db = require("./config/db");

// Routes
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const forecastRoutes = require("./routes/forecast");
const analyticsRoutes = require("./routes/analyticsRoutes");
const homeRoutes = require("./routes/homeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || "https://kgs-sales-forecasting-frontend.onrender.com",
  credentials: true
}));

// Sessions
app.use(sessionConfig);

// JSON parser
app.use(express.json());

// Static files
app.use("/files", express.static(path.join(__dirname, "files")));

// Routes
app.use("/", authRoutes);
app.use("/", dataRoutes);
app.use("/", forecastRoutes);
app.use("/", analyticsRoutes);
app.use("/", homeRoutes);
app.use("/api/notifications", notificationRoutes);

// Default route
app.get("/", (req, res) => res.send("Sales Forecasting System - Backend Running 🚀"));

// Session check endpoints
app.get("/api/check-session", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.status(401).json({ loggedIn: false });
});

// Debug session
app.get("/api/debug-session", (req, res) => {
  res.json({
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    userId: req.session?.user?.id,
    userEmail: req.session?.user?.email
  });
});

// Test notification
app.post("/test-notification", (req, res) => {
  res.json({
    hasSession: !!req.session,
    user: req.session?.user || null
  });
});

// Start server after DB connection
async function startServer() {
  try {
    await db.query("SELECT 1");
    console.log("✅ Connected to Supabase Postgres");

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
}

startServer();
