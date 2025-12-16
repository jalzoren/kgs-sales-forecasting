// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const sessionConfig = require("./config/sessionConfig");
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

// =======================
// CORS (RENDER SAFE)
// =======================

app.set("trust proxy", 1); // Required behind proxy (Render)

// Allow configured frontend URL(s) for CORS. Use environment variable `FRONTEND_URL`
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://kgs-sales-forecasting-frontend1.onrender.com",
  "https://kgs-sales-forecasting-yerg.onrender.com",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (e.g., mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Origin not allowed'));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
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

// =======================
// Routes
// =======================
// Auth routes
app.use("/api", authRoutes);

// Forecast routes
app.use("/api/forecast", forecastRoutes);

// Notifications routes
app.use("/api/notifications", notificationRoutes);

// Other data/analytics/home routes
app.use("/api/data", dataRoutes);
app.use("/", analyticsRoutes);
app.use("/", homeRoutes);

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
  res.send("Backend running 🚀");
});

// =======================
// Health check
// =======================
app.get("/health", async (req, res) => {
  try {
    const result = await db.query("SELECT 1");
    return res.json({ ok: true, db: !!result });
  } catch (err) {
    console.error("Health check DB error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Global error handler to return JSON for uncaught errors
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Server error", error: err && err.message ? err.message : String(err) });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
