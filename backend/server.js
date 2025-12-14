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
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server tools
    if (!origin) return callback(null, true);

    // ✅ Allow ALL localhost ports in development
    if (
      process.env.NODE_ENV !== "production" &&
      origin.startsWith("http://localhost")
    ) {
      return callback(null, true);
    }

    // ✅ Allow production frontend
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // ❌ DO NOT THROW — just deny silently
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
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
app.use("/api/forecast", forecastRoutes);
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