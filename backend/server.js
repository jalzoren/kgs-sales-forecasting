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
// CORS (LOCAL + PROD SAFE)
// =======================
const allowedOrigins = [
  process.env.FRONTEND_URL,       // Local
  process.env.FRONTEND_URL_PROD   // Production
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server tools or mobile apps with no origin
    if (!origin) return callback(null, true);

    // Allow localhost in development
    if (origin.startsWith("http://localhost")) return callback(null, true);

    // Allow production frontend (exact match)
    if (allowedOrigins.some(o => o === origin || o + "/" === origin)) return callback(null, true);

    // Deny all others
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Handle OPTIONS requests globally
app.options("*", cors());

// =======================
// Sessions
// =======================
app.set("trust proxy", 1); // REQUIRED for secure cookies on Render
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
// SESSION CHECK
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
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
