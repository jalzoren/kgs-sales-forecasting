require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// ROUTES
const sessionConfig = require("./config/sessionConfig");
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const forecastRoutes = require("./routes/forecast"); 
const analyticsRoutes = require("./routes/analyticsRoutes"); 
const homeRoutes = require("./routes/homeRoutes"); 

const app = express();
const PORT = 5000;

// =====================================================
// Enable CORS
// =====================================================
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

// =====================================================
// Default route
// =====================================================
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// =====================================================
// Session check endpoint
// =====================================================
app.get("/api/check-session", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

// =====================================================
// Start server
// =====================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
