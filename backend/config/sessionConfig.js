// backend/config/sessionConfig.js
const session = require("express-session");

const sessionConfig = session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
 cookie: {
  secure: true, // only secure in prod
  httpOnly: true,
  sameSite: "none",
  maxAge: 1000 * 60 * 30
}

});

module.exports = sessionConfig;
