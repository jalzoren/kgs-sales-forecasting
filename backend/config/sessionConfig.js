// backend/config/sessionConfig.js
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const db = require("./db"); // your MySQL connection pool or config

// Create session store
const sessionStore = new MySQLStore({}, db.promise ? db.promise() : db); 
// if your db is a mysql2 pool, use db.promise()

const sessionConfig = session({
  name: "sid",
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  proxy: true, // needed if behind proxy like Render
  cookie: {
    secure: process.env.NODE_ENV === "production", // true only in production
    httpOnly: true, // inaccessible to JS on frontend
    sameSite: "none", // needed for cross-origin cookies
    maxAge: 1000 * 60 * 30 // 30 minutes
  }
});

module.exports = sessionConfig;
