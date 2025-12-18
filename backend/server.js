// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

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

// =======================
// CORS (RENDER SAFE)
// =======================

app.set("trust proxy", 1); // Required behind proxy (Render)

app.use(cors({
  origin: "https://kgs-sales-forecasting-frontend1.onrender.com", // your frontend URL
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));


app.use(express.json());

// =======================
// Sessions
// =======================
app.use(sessionConfig);


// =======================
// Body parser
// =======================

// =======================
// Static files
// =======================
app.use("/files", express.static(path.join(__dirname, "files")));

// ═══════════════════════════════════════════════════════════
// ROUTES - ALL UNDER /api PREFIX FOR CONSISTENCY
// ═══════════════════════════════════════════════════════════
// Auth routes → /api/login, /api/register, /api/check-session, etc.
app.use("/api", authRoutes);

// Data routes → /api/data
app.use("/api", dataRoutes);

// Forecast routes → /api/forecast
app.use("/api/forecast", forecastRoutes);

// Home routes → /api/home
app.use("/api", homeRoutes);

// Analytics routes → /api/analytics
app.use("/api", analyticsRoutes);

// Notification routes → /api/notifications
app.use("/api/notifications", notificationRoutes);

// =======================
// SESSION CHECK
// =======================
app.get("/api/check-session", (req, res) => {
  if (req.session?.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.status(401).json({ loggedIn: false });
});

// =======================
// Root
// =======================
app.get("/", (req, res) => {
  res.json({ 
    status: "running", 
    message: "KGS Sales Forecasting API. Backend running 🚀",
    timestamp: new Date().toISOString()
  });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database: ${process.env.SUPABASE_DB_URL ? 'Supabase (PostgreSQL)' : 'MySQL'}`);
});