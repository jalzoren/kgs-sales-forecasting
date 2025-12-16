// backend/config/db.js
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL; // https://xxxx.supabase.co/rest/v1
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("❌ SUPABASE_URL or SUPABASE_KEY is not set in .env");
}

const db = {
  query: async (table, options = {}) => {
    if (!table) throw new Error("❌ Table name is required");

    const url = `${SUPABASE_URL}/${table}`;
    const config = {
      method: options.method || "GET",
      url,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation", // Supabase default
      },
      params: options.params || undefined,
      data: options.data || undefined,
    };

    try {
      const res = await axios(config);
      return res.data;
    } catch (err) {
      console.error("❌ Supabase API query error:", err.response?.data || err.message);
      throw err;
    }
  },
};

module.exports = db;
