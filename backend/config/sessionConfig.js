const session = require("express-session");

const isProd = process.env.NODE_ENV === "production";

const sessionConfig = session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true, // ✅ REQUIRED for Render
  cookie: {
    secure: isProd,                 // ✅ HTTPS on Render
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    maxAge: 1000 * 60 * 30
  }
});

module.exports = sessionConfig;
