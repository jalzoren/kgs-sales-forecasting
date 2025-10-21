// server.js
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const sessionConfig = require("./config/sessionConfig");

const app = express();
const PORT = 5000;


// Middleware
app.use(cors());
app.use(express.json());
app.use(sessionConfig);

// Routes
app.use("/", authRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
