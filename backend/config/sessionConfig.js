const session = require("express-session");

const sessionConfig = session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,          // ✅ Render uses HTTPS
    httpOnly: true,
    sameSite: "none",      // ✅ REQUIRED for cross-site
    maxAge: 1000 * 60 * 30 // 30 minutes
  }
});

module.exports = sessionConfig;
