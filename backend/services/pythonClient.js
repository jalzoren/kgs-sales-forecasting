const axios = require("axios");

// Python FastAPI server (main_app.py) runs on port 8000
// Frontend Vite dev server runs on port 5173
// Node.js backend runs on port 3000
const PYTHON_API = "http://localhost:8000"; // ✅ FastAPI server (main_app.py)

/**
 * Fetch forecast results from Python FastAPI (forecastModel.py)
 * Returns: { status, user_id, forecast_file, forecasts, evaluation, demand_levels, ... }
 */
async function fetchForecastFromPython(userId) {
  try {
    console.log(`🔗 Fetching forecast from Python API for user ${userId}...`);
    // Increase timeout to allow long-running forecasts to complete
    const response = await axios.get(`${PYTHON_API}/api/forecast/${userId}`, {
      timeout: 300000, // 5 minutes
    });
    console.log(`✅ Successfully fetched Python forecast for user ${userId}`);
    return response.data;
  } catch (err) {
    console.error(`❌ Python API Error (${PYTHON_API}):`, err.message);
    if (err.response?.status === 404) {
      console.error("   → Forecast not found. Models may not be trained yet.");
    } else if (err.code === 'ECONNREFUSED') {
      console.error("   → Cannot connect to Python API. Is main_app.py running on port 8000?");
    }
    return null;
  }
}

module.exports = { fetchForecastFromPython };
