require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Session
const sessionConfig = require("./config/sessionConfig");

// Routes
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const forecastRoutes = require("./routes/forecast");
const analyticsRoutes = require("./routes/analyticsRoutes");
const homeRoutes = require("./routes/homeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

/* =====================================================
   TRUST PROXY (REQUIRED FOR RENDER COOKIES)
===================================================== */
app.set("trust proxy", 1);

/* =====================================================
   CORS (FRONTEND DOMAIN ONLY)
===================================================== */
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // 🔴 NOT VITE_API_BASE_URL
    credentials: true
  })
);

/* =====================================================
   BODY PARSER
===================================================== */
app.use(express.json());

/* =====================================================
   SESSION (AFTER CORS, BEFORE ROUTES)
===================================================== */
app.use(sessionConfig);

/* =====================================================
   STATIC FILES
===================================================== */
app.use("/files", express.static(path.join(__dirname, "files")));

/* =====================================================
   ROUTES
===================================================== */

// Auth & session
app.use("/api", authRoutes);              // /api/login, /api/check-session

// Data / forecast / analytics
app.use("/api", dataRoutes);
app.use("/api", forecastRoutes);
app.use("/api", analyticsRoutes);

// Dashboard (already has /api/home/dashboard)
app.use(homeRoutes);

// Notifications
app.use("/api/notifications", notificationRoutes);

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
