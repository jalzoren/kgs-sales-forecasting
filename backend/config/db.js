// backend/config/db.js, this is the database connection module
const mysql = require("mysql");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool.promise();

db.connect((error) => {
  if (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL Database");
});

module.exports = db;
