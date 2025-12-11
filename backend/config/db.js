// backend/config/db.js
const { Pool } = require("pg");

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // required for Supabase
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Database connected to Supabase");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

// Export pool for queries
module.exports = pool;
