// backend/config/db.js
const mysql = require("mysql2");

// Create a connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,      // InfinityFree host, e.g., sql123.epizy.com
  user: process.env.DB_USER,      // Your database username
  password: process.env.DB_PASS,  // Your database password
  database: process.env.DB_NAME,  // Your database name
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1); // stop server if DB connection fails
  } else {
    console.log("✅ Connected to MySQL Database");
    conn.release();
  }
});

module.exports = db;
