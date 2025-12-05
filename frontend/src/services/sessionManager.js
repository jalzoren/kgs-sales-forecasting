// frontend/src/services/sessionManager.js
/**
 * ═══════════════════════════════════════════════════════════════
 * SESSION MANAGER - Frontend Session & Forecast Cache
 * ═══════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 *   Manages user session data and forecast status with caching
 *   Eliminates redundant API calls during login/navigation flow
 * 
 * PERFORMANCE:
 *   - Without cache: Login → LoadingCheck = 2-3 API calls (~2000ms)
 *   - With cache: Login → LoadingCheck = 1 API call (~500ms)
 * 
 * USAGE:
 *   - Login.jsx: initializeSession() after successful login
 *   - LoadingCheck.jsx: getForecastStatus() for navigation
 *   - ProtectedRoute.jsx: getForecastStatus() for access control
 *   - UserMenu.jsx: getUserInfo() for display
 *   - Navbar.jsx: invalidateForecastCache() after data changes
 * ═══════════════════════════════════════════════════════════════
 */

const API_BASE = "http://localhost:5000";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class SessionManager {
  constructor() {
    this.cache = {
      user: null,
      forecastStatus: null,
      userTimestamp: null,
      forecastTimestamp: null
    };
  }

  /**
   * Initialize session after successful login
   * Fetches user info + forecast status in PARALLEL
   * 
   * Returns: { user, forecastStatus }
   * Performance: ~500ms (parallel fetch)
   */
  async initializeSession() {
    console.log("🔐 Initializing session...");
    
    try {
      // ✅ Fetch both in PARALLEL - saves 1-2 seconds!
      const [user, forecastStatus] = await Promise.all([
        this.fetchUserInfo(),
        this.fetchForecastStatus()
      ]);

      // Cache both results
      this.cache.user = user;
      this.cache.forecastStatus = forecastStatus;
      this.cache.userTimestamp = Date.now();
      this.cache.forecastTimestamp = Date.now();

      console.log("✅ Session initialized:", { user, forecastStatus });

      return { user, forecastStatus };
    } catch (err) {
      console.error("❌ Session initialization failed:", err);
      throw err;
    }
  }

  /**
   * Get user info (uses cache if fresh)
   * 
   * Returns: { id, email, firstName, lastName }
   * Performance: <5ms (cached) or ~200ms (API call)
   */
  async getUserInfo(forceRefresh = false) {
    // Check cache
    if (!forceRefresh && this.isCacheFresh('user')) {
      console.log("✅ Using cached user info");
      return this.cache.user;
    }

    // Fetch fresh data
    console.log("🔄 Fetching fresh user info...");
    const user = await this.fetchUserInfo();
    
    this.cache.user = user;
    this.cache.userTimestamp = Date.now();
    
    return user;
  }

  /**
   * Get forecast status (uses cache if fresh)
   * 
   * Returns: { hasForecast, forecastCount, latestForecast }
   * Performance: <5ms (cached) or ~300ms (API call)
   */
  async getForecastStatus(forceRefresh = false) {
    // Check cache
    if (!forceRefresh && this.isCacheFresh('forecast')) {
      console.log("✅ Using cached forecast status");
      return this.cache.forecastStatus;
    }

    // Fetch fresh data
    console.log("🔄 Fetching fresh forecast status...");
    const status = await this.fetchForecastStatus();
    
    this.cache.forecastStatus = status;
    this.cache.forecastTimestamp = Date.now();
    
    return status;
  }

  /**
   * Invalidate forecast cache (call after generating new forecast)
   * Forces next getForecastStatus() to fetch fresh data
   */
  invalidateForecastCache() {
    console.log("🔄 Invalidating forecast cache...");
    this.cache.forecastStatus = null;
    this.cache.forecastTimestamp = null;
  }

  /**
   * Clear all cache (call on logout)
   */
  clearCache() {
    console.log("🗑️ Clearing all session cache...");
    this.cache = {
      user: null,
      forecastStatus: null,
      userTimestamp: null,
      forecastTimestamp: null
    };
  }

  /**
   * Check if cache is still fresh
   * Private helper method
   */
  isCacheFresh(type) {
    const timestampKey = type === 'user' ? 'userTimestamp' : 'forecastTimestamp';
    const dataKey = type === 'user' ? 'user' : 'forecastStatus';
    
    if (!this.cache[dataKey] || !this.cache[timestampKey]) {
      return false;
    }

    const age = Date.now() - this.cache[timestampKey];
    return age < CACHE_DURATION;
  }

  /**
   * Fetch user info from API
   * Private helper method
   */
  async fetchUserInfo() {
    try {
      const response = await fetch(`${API_BASE}/api/check-session`, {
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Not authenticated");
      }

      const data = await response.json();
      
      if (!data.loggedIn || !data.user) {
        throw new Error("No user session");
      }

      return data.user;
    } catch (err) {
      console.error("❌ Failed to fetch user info:", err);
      throw err;
    }
  }

  /**
   * Fetch forecast status from API
   * Private helper method
   */
  async fetchForecastStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/forecast/status`, {
        credentials: "include"
      });

      // ✅ Handle 404 gracefully (no forecasts yet)
      if (response.status === 404) {
        return {
          hasForecast: false,
          forecastCount: 0,
          latestForecast: null
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error("❌ Failed to fetch forecast status:", err);
      // Return default "no forecast" status instead of throwing
      return {
        hasForecast: false,
        forecastCount: 0,
        latestForecast: null
      };
    }
  }
}

// Export singleton instance
export default new SessionManager();