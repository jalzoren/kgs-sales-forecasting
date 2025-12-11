require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db"); // Supabase API

// Routes
const sessionConfig = require("./config/sessionConfig");
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
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Sessions
app.use(sessionConfig);

// JSON Body Parser
app.use(express.json());

// Serve static files
app.use("/files", express.static(path.join(__dirname, "files")));

// Mount routes
app.use("/", authRoutes);
app.use("/", dataRoutes);
app.use("/", forecastRoutes);
app.use("/", analyticsRoutes); 
app.use("/", homeRoutes); 
app.use("/api/notifications", notificationRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// Session check endpoint
app.get("/api/check-session", (req, res) => {
  if (req.session?.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

// =====================================================
// Start serverVHGVHGVH with Supabase API test
// =====================================================
async function startServer() {
  try {
    // Test API connection: GET first row from "salesData" table
    const test = await db.query("salesData", { params: { select: "*" , limit: 1 } });
    console.log("✅ Connected to Supabase API, rows fetched:", test.length);

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Supabase connection failed:", err.message || err);
    process.exit(1);
  }
}

startServer();
