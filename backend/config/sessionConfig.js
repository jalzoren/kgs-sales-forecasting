// config/sessionConfig.js
require("dotenv").config();
const session = require("express-session");

const sessionConfig = session({
  secret: process.env.SESSION_SECRET, // 🔒 Change this to a long, random string
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,             // true only if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 30     // 30 minutes
  }
});

module.exports = sessionConfig;
