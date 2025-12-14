const session = require("express-session");

module.exports = session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,        // REQUIRED on Render
    httpOnly: true,
    sameSite: "none",    // REQUIRED for cross-site
    maxAge: 1000 * 60 * 60 * 24
  }
});
