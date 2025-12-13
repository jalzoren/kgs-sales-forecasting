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
app.use(cors({
  origin: process.env.VITE_API_BASE_URL,
  credentials: true
}));

// =======================
// Sessions
// =======================
app.set("trust proxy", 1); // ✅ REQUIRED
app.use(sessionConfig);

// =======================
// Body parser
// =======================
app.use(express.json());

// =======================
// Static files
// =======================
app.use("/files", express.static(path.join(__dirname, "files")));

// =======================
// Routes
// =======================
app.use("/", authRoutes);
app.use("/", dataRoutes);
app.use("/", forecastRoutes);
app.use("/", analyticsRoutes);
app.use("/", homeRoutes);
app.use("/api/notifications", notificationRoutes);

// =======================
// SESSION CHECK (MATCH FRONTEND)
// =======================
app.get("/check-session", (req, res) => {
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
// START SERVER (NO DB TEST)
// =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
