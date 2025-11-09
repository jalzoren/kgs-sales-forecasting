// config/sessionConfig.js
const session = require("express-session");

const sessionConfig = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,  // ✅ important: don’t save empty sessions
  cookie: {
    secure: false,           // ✅ keep false for localhost (no HTTPS)
    httpOnly: true,
    sameSite: "lax",         // ✅ must allow cookies to be sent cross-origin
    maxAge: 1000 * 60 * 30   // 30 minutes
  }
});

module.exports = sessionConfig;
