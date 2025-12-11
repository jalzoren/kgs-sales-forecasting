const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }, // required for Supabase
  family: 4 // force IPv4
});

pool.on("connect", () => console.log("✅ Database pool initialized"));
pool.on("error", (err) => console.error("❌ Postgres Pool Error:", err));

module.exports = pool;
