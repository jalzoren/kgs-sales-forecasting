// backend/config/db.js
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,        // from .env
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // required for Supabase
});

pool.on("connect", () => {
  console.log("✅ Database connected to Supabase");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

module.exports = pool;
