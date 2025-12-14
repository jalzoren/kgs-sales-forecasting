// backend/config/db.js
/*
  Dual-mode database adapter: MySQL (local) or Postgres (Supabase)
*/

const mysql = require("mysql");
const { Pool } = require("pg");

// Determine which DB to use
const useSupabaseDb = !!process.env.SUPABASE_DB_URL || process.env.USE_SUPABASE_DB === 'true';

let db = {};

if (useSupabaseDb) {
  if (!process.env.SUPABASE_DB_URL) {
    throw new Error("❌ SUPABASE_DB_URL is required when using Supabase/Postgres mode");
  }

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    // Force IPv4 to avoid ENETUNREACH issues
    family: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });

  db.query = (text, params, cb) => {
    if (typeof params === "function") {
      cb = params;
      params = [];
    }

    // Convert MySQL ? placeholders to Postgres $1, $2...
    const convertPlaceholders = (sql) => {
      if (!sql || !sql.includes("?")) return sql;
      let i = 0;
      return sql.replace(/\?/g, () => {
        i += 1;
        return `$${i}`;
      });
    };

    const finalSql = convertPlaceholders(text);

    if (cb && typeof cb === "function") {
      pool
        .query(finalSql, params)
        .then((result) => cb(null, result.rows))
        .catch((err) => cb(err));
      return;
    }

    return pool.query(finalSql, params).then((r) => r.rows);
  };

  db.getClient = () => pool;

  console.log("🔌 Database adapter: using Supabase/Postgres (pg, IPv4 forced)");

} else {
  // MySQL local dev
  const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "kgs",
  });

  db.query = (sql, params, cb) => pool.query(sql, params, cb);

  db.getPool = () => pool;

  console.log("🔌 Database adapter: using MySQL (mysql)");
}

module.exports = db;
