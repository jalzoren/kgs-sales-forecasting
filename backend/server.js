// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const sessionConfig = require("./config/sessionConfig");

const app = express();
const PORT = 5000;

// ✅ 1. Enable CORS first
app.use(cors({
  origin: "http://localhost:5173",   // your React app
  credentials: true,                 // allow cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ 2. Setup session BEFORE body parsing
app.use(sessionConfig);

// ✅ 3. Then enable JSON parsing
app.use(express.json());

// ✅ 4. Routes
app.use("/", authRoutes);
app.use("/", dataRoutes);

// ✅ 5. Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// ✅ 6. Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});


app.get("/api/check-session", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

