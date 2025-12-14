const session = require("express-session");

module.exports = session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  proxy: true, // REQUIRED on Render

  cookie: {
    httpOnly: true,
    secure: true,        // REQUIRED for HTTPS
    sameSite: "none",    // REQUIRED for cross-origin
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  },
});
