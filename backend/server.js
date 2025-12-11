require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db"); // Postgres Pool
const sessionConfig = require("./config/sessionConfig");
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const forecastRoutes = require("./routes/forecast"); 
const analyticsRoutes = require("./routes/analyticsRoutes"); 
const homeRoutes = require("./routes/homeRoutes"); 
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------
// Enable CORS
// ---------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ---------------------------
// Sessions
// ---------------------------
app.use(sessionConfig);

// ---------------------------
// JSON Body Parser
// ---------------------------
app.use(express.json());

// ---------------------------
// Serve static files
// ---------------------------
app.use("/files", express.static(path.join(__dirname, "files")));

// ---------------------------
// Mount routes
// ---------------------------
app.use("/", authRoutes);
app.use("/", dataRoutes);
app.use("/", forecastRoutes);
app.use("/", analyticsRoutes); 
app.use("/", homeRoutes); 
app.use("/api/notifications", notificationRoutes);

// ---------------------------
// Default route
// ---------------------------
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// ---------------------------
// Session check
// ---------------------------
app.get("/api/check-session", (req, res) => {
  if (req.session?.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

// ---------------------------
// Debug session
// ---------------------------
app.get("/api/debug-session", (req, res) => {
  res.json({
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
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

// ---------------------------
// Start server and test DB
// ---------------------------
async function startServer() {
  try {
    console.log("🌐 Attempting to connect to Supabase...");
    const res = await db.query("SELECT NOW() AS time"); // test query
    console.log("✅ Supabase connection successful. Time:", res.rows[0].time);

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Supabase connection failed.");
    if (err.code === 'ENETUNREACH' || err.message.includes('ENETUNREACH')) {
      console.error("⚠️ Network unreachable. Your Render Free instance cannot reach Supabase.");
      console.error("💡 Fix: Allow all IPs in Supabase Network Restrictions (or use internal Postgres).");
    } else if (err.code === '28P01') {
      console.error("⚠️ Authentication failed. Check DB_USER and DB_PASS.");
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

startServer();
