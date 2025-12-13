const session = require("express-session");

const sessionConfig = session({
  secret: process.env.SESSION_SECRET || "secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // true in production (HTTPS)
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", 
    maxAge: 1000 * 60 * 30, // 30 minutes
  },
});

module.exports = sessionConfig;
