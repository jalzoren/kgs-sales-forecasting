// backend/config/db.js
/*
  db.js - Dual-mode database adapter

  This file provides a compatible `query(sql, params, callback)` interface so
  existing controllers (which use MySQL-style queries) continue to work.

  Modes:
  - Postgres (Supabase): Set `SUPABASE_DB_URL` environment variable (postgres://...)
    and optionally set `USE_SUPABASE_DB=true`. The adapter will use `pg.Pool`.

  - MySQL (local development): Set `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`,
    and `MYSQL_DATABASE`. The adapter will use `mysql` and a connection pool.

  The exported `query` function supports both callback-style and Promise-style
  invocations:
    db.query(sql, params, callback)
    db.query(sql, params).then(rows => ...)

  When deploying to Render + Supabase, migrate your MySQL data to Supabase
  (Postgres) and set `SUPABASE_DB_URL` in Render secrets. See README steps.
*/

const mysql = require("mysql");
const { Pool } = require("pg");

const useSupabaseDb = !!process.env.SUPABASE_DB_URL || process.env.USE_SUPABASE_DB === 'true';

let db = {};

if (useSupabaseDb) {
  // Postgres / Supabase mode
  if (!process.env.SUPABASE_DB_URL) {
    throw new Error("❌ SUPABASE_DB_URL is required when using Supabase/Postgres mode");
  }

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    // Supabase requires SSL in most hosted environments
    ssl: { rejectUnauthorized: false }
  });

  db.query = (text, params, cb) => {
    // Support optional params and callback
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }

    // Convert MySQL-style ? placeholders to Postgres $1, $2, ... when needed
    const convertPlaceholders = (sql) => {
      if (!sql || !sql.includes('?')) return sql;
      let i = 0;
      return sql.replace(/\?/g, () => {
        i += 1;
        return `$${i}`;
      });
    };

    const finalSql = convertPlaceholders(text);

    if (cb && typeof cb === 'function') {
      pool.query(finalSql, params)
        .then(result => cb(null, result.rows))
        .catch(err => cb(err));
      return;
    }

    // Promise style
    return pool.query(finalSql, params).then(r => r.rows);
  };

  db.getClient = () => pool;

  console.log('🔌 Database adapter: using Supabase/Postgres (pg)');

} else {
  // MySQL (local) mode - keep using mysql pool and the same callback-style API
  const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'kgs'
  });

  db.query = (sql, params, cb) => {
    // mysql library already supports (sql, params, callback)
    return pool.query(sql, params, cb);
  };

  db.getPool = () => pool;

  console.log('🔌 Database adapter: using MySQL (mysql)');
}

module.exports = db;