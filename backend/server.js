// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes"); 
const sessionConfig = require("./config/sessionConfig");

const app = express();
const PORT = 5000;


// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your React dev server URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(sessionConfig);

// Routes
app.use("/", authRoutes);
app.use("/", dataRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Backend Running 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
