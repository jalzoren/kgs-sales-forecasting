/**
 * ═══════════════════════════════════════════════════════════════
 * DATABASE ADAPTER - PostgreSQL (via Supabase)
 * ═══════════════════════════════════════════════════════════════
 * Uses native pg client to connect to Supabase PostgreSQL database
 * Supports parameterized queries with automatic placeholder conversion
 */

const { Pool } = require("pg");

// Get database URL from environment
const DATABASE_URL = process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
  throw new Error("❌ SUPABASE_DB_URL is not set in .env");
}

// Create connection pool with SSL required for Supabase
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
  max: 20, // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Execute a parameterized query
 * Converts ? placeholders to $1, $2, etc. for PostgreSQL
 * 
 * @param {string} sql - SQL query with ? placeholders or $1, $2 placeholders
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result with rows property
 */
const query = async (sql, params = []) => {
  try {
    // Convert ? placeholders to PostgreSQL $1, $2, etc.
    let processedSql = sql;
    let placeholderIndex = 1;
    
    processedSql = processedSql.replace(/\?/g, () => {
      return `$${placeholderIndex++}`;
    });

    console.log(`🔍 Query: ${processedSql.substring(0, 80)}...`);
    
    const result = await pool.query(processedSql, params);
    
    console.log(`✅ Query result: ${result.rowCount} row(s)`);
    return result;
  } catch (err) {
    console.error("❌ Database query error:", err.message);
    console.error("   SQL:", sql.substring(0, 100));
    console.error("   Params:", params);
    throw err;
  }
};

/**
 * Execute an INSERT/UPDATE/DELETE query
 * Returns the modified rows
 * 
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of affected rows
 */
const execute = async (sql, params = []) => {
  const result = await query(sql, params);
  return result.rows;
};

/**
 * Execute an UPDATE query
 * 
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of updated rows
 */
const update = async (sql, params = []) => {
  return execute(sql, params);
};

/**
 * Execute a DELETE query
 * 
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of deleted rows
 */
const deleteQuery = async (sql, params = []) => {
  return execute(sql, params);
};

/**
 * Start a transaction
 * 
 * @returns {Promise<Object>} - Client for transaction
 */
const transaction = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return {
      query: (sql, params) => client.query(sql, params),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
      release: () => client.release(),
    };
  } catch (err) {
    client.release();
    throw err;
  }
};

/**
 * Health check - verify database connection
 * 
 * @returns {Promise<boolean>} - True if connected
 */
const healthCheck = async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0]);
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    return false;
  }
};

/**
 * Close all connections
 */
const close = async () => {
  await pool.end();
  console.log("✅ Database pool closed");
};

module.exports = {
  query,
  execute,
  update,
  delete: deleteQuery,
  transaction,
  healthCheck,
  close,
};
