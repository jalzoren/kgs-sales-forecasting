// backend/config/sessionConfig.js
const session = require("express-session");

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: "session"
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 30
  }
}));

module.exports = sessionConfig;
