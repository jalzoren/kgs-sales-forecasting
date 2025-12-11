const axios = require("axios");

const PYTHON_API = "http://localhost:5173"; // Adjust if needed

async function fetchForecastFromPython(userId) {
  try {
    const response = await axios.get(`${PYTHON_API}/api/forecast/${userId}`, {
      timeout: 15000,
    });
    return response.data;
  } catch (err) {
    console.error("❌ Python API Error:", err.message);
    return null;
  }
}

module.exports = { fetchForecastFromPython };
