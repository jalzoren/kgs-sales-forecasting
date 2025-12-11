require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// DATABASE
const db = require("./config/db"); // Import DB connection

// ROUTES
const sessionConfig = require("./config/sessionConfig");
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const forecastRoutes = require("./routes/forecast"); 
const analyticsRoutes = require("./routes/analyticsRoutes"); 
const homeRoutes = require("./routes/homeRoutes"); 
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 5000; // REQUIRED in Render

// =====================================================
// Enable CORS
// =====================================================
app.use(cors({
  origin: "https://kgs-sales-forecasting-frontend.onrender.com",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// =====================================================
// Sessions
// =====================================================
app.use(sessionConfig);

// =====================================================
// JSON Body Parser
// =====================================================
app.use(express.json());

// =====================================================
// Serve static files (forecast Excel files)
// =====================================================
app.use(
  "/files",
  express.static(path.join(__dirname, "files"))
);

// =====================================================
// Mount routes
// =====================================================
app.use("/", authRoutes);
app.use("/", dataRoutes);
app.use("/", forecastRoutes);
app.use("/", analyticsRoutes); 
app.use("/", homeRoutes); 
app.use("/api/notifications", notificationRoutes);

// =====================================================
// Default route
// =====================================================
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// =====================================================
// Session check endpoints
// =====================================================
app.get("/api/check-session", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

app.get("/api/debug-session", (req, res) => {
  res.json({
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    userId: req.session?.user?.id,
    userEmail: req.session?.user?.email
  });
});

app.post("/test-notification", (req, res) => {
  console.log("Test notification - Session:", req.session);
  console.log("Test notification - User:", req.session?.user);
  res.json({
    hasSession: !!req.session,
    user: req.session?.user || null
  });
});

// =====================================================
// Connect to Database and Start Server
// =====================================================
async function startServer() {
  try {
    // Test connection
    const res = await db.query("SELECT 1"); 
    console.log("✅ Connected to Supabase Postgres:", res.rows);

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1); // Stop server if DB fails
  }
}

