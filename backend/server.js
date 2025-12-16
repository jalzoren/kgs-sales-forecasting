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
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
