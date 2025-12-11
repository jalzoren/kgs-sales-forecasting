// backend/config/db.js
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL + "/rest/v1"; // REST endpoint
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Mimic query interface
const db = {
  query: async (table, options = {}) => {
    try {
      const res = await axios({
        method: options.method || "GET",
        url: `${SUPABASE_URL}/${table}`,
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        params: options.params || null,
        data: options.data || null,
      });
      return res.data;
    } catch (err) {
      console.error("❌ Supabase API query error:", err.response?.data || err.message);
      throw err;
    }
  }
};

module.exports = db;
