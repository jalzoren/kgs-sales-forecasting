// config/sessionConfig.js
const session = require("express-session");

const sessionConfig = session({
  secret: "superSecretKey123!", // 🔒 Change this to a long, random string
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,             // true only if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 30     // 30 minutes
  }
});

module.exports = sessionConfig;
