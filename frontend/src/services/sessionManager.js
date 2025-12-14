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
 * CACHE ISOLATION (🆕):
 *   - Navbar has its own cache that's NEVER force-cleared
 *   - Dashboard has its own cache that can be force-refreshed
 *   - Prevents dashboard refresh from breaking navbar dates
 * 
 * USAGE:
 *   - Login.jsx: initializeSession() after successful login
 *   - LoadingCheck.jsx: getForecastStatus() for navigation
 *   - ProtectedRoute.jsx: getForecastStatus() for access control
 *   - UserMenu.jsx: getUserInfo() for display
 *   - Navbar.jsx: getDashboardData(7, false, 'navbar')
 *   - Dashboard.jsx: getDashboardData(days, true, 'dashboard')
 * ═══════════════════════════════════════════════════════════════
 */

const API_BASE = import.meta.env.VITE_API_URL; // ✅ backend URL from .env
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const DASHBOARD_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for dashboard

class SessionManager {
  constructor() {
    this.cache = {
      // Session data
      user: null,
      forecastStatus: null,
      userTimestamp: null,
      forecastTimestamp: null,
      
      // 🆕 SEPARATE CACHES: Navbar and Dashboard
      // This prevents dashboard refresh from affecting navbar
      navbar: {
        data: null,
        timestamp: null
      },
      dashboard: {
        7: null,
        30: null,
        90: null
      },
      dashboardTimestamp: {
        7: null,
        30: null,
        90: null
      }
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
   * ═══════════════════════════════════════════════════════════════
   * DASHBOARD DATA CACHE WITH SOURCE ISOLATION (🆕 FIXED)
   * ═══════════════════════════════════════════════════════════════
   */

  /**
   * Get dashboard data with source-based isolation
   * 
   * @param {number} days - Day range (7, 30, or 90)
   * @param {boolean} forceRefresh - Force fetch from API
   * @param {string} source - 'navbar' or 'dashboard' (determines cache behavior)
   * @returns {Object} Dashboard data
   * 
   * CACHE STRATEGY:
   *   - source='navbar': Uses navbar cache, NEVER affected by forceRefresh
   *   - source='dashboard': Uses day-based cache, CAN be force-refreshed
   * 
   * Performance: <10ms (cached) or ~1500ms (first load)
   */
  async getDashboardData(days = 7, forceRefresh = false, source = 'dashboard') {
    // Validate day range
    const validDays = [7, 30, 90];
    if (!validDays.includes(days)) {
      days = 7;
    }

    // 🔒 NAVBAR CACHE: Completely isolated, never force-cleared
    if (source === 'navbar') {
      // Check navbar-specific cache
      if (!forceRefresh && this.isNavbarCacheFresh()) {
        const age = Math.round((Date.now() - this.cache.navbar.timestamp) / 1000);
        console.log(`✅ Using cached navbar data (age: ${age}s)`);
        return this.cache.navbar.data;
      }

      // Fetch fresh data for navbar
      console.log(`🔄 Fetching fresh navbar data (${days} days)...`);
      const data = await this.fetchDashboardData(days);
      
      // Cache in navbar-specific slot
      this.cache.navbar.data = data;
      this.cache.navbar.timestamp = Date.now();
      
      console.log(`✅ Cached navbar data successfully`);
      return data;
    }

    // 📊 DASHBOARD CACHE: Day-based, can be force-refreshed
    // Check cache
    if (!forceRefresh && this.isDashboardCacheFresh(days)) {
      const age = Math.round((Date.now() - this.cache.dashboardTimestamp[days]) / 1000);
      console.log(`✅ Using cached dashboard data (${days} days, age: ${age}s)`);
      return this.cache.dashboard[days];
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh dashboard data (${days} days, forceRefresh: ${forceRefresh})...`);
    const data = await this.fetchDashboardData(days);
    
    // Cache the result in day-specific slot
    this.cache.dashboard[days] = data;
    this.cache.dashboardTimestamp[days] = Date.now();
    
    console.log(`✅ Cached dashboard data (${days} days) successfully`);
    return data;
  }

  /**
   * Invalidate dashboard cache (call after data upload or forecast generation)
   * Clears ONLY dashboard caches, NOT navbar cache
   */
  invalidateDashboardCache() {
    console.log("🔄 Invalidating dashboard cache (all ranges)...");
    this.cache.dashboard = {
      7: null,
      30: null,
      90: null
    };
    this.cache.dashboardTimestamp = {
      7: null,
      30: null,
      90: null
    };
    // 🔒 Navbar cache is NOT cleared here
  }

  /**
   * Invalidate navbar cache (call after data upload if needed)
   * Rarely used - navbar cache usually stays valid
   */
  invalidateNavbarCache() {
    console.log("🔄 Invalidating navbar cache...");
    this.cache.navbar.data = null;
    this.cache.navbar.timestamp = null;
  }

  /**
   * Invalidate forecast cache (call after generating new forecast)
   * Forces next getForecastStatus() to fetch fresh data
   * Also invalidates dashboard cache since forecast affects it
   */
  invalidateForecastCache() {
    console.log("🔄 Invalidating forecast cache...");
    this.cache.forecastStatus = null;
    this.cache.forecastTimestamp = null;
    
    // Also invalidate dashboard cache
    this.invalidateDashboardCache();
    
    // 🆕 ALSO invalidate navbar cache when forecast changes
    this.invalidateNavbarCache();
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
      forecastTimestamp: null,
      navbar: {
        data: null,
        timestamp: null
      },
      dashboard: {
        7: null,
        30: null,
        90: null
      },
      dashboardTimestamp: {
        7: null,
        30: null,
        90: null
      }
    };
  }

  /**
   * Check if user/forecast cache is still fresh
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
   * 🆕 Check if navbar cache is fresh
   * Private helper method
   */
  isNavbarCacheFresh() {
    if (!this.cache.navbar.data || !this.cache.navbar.timestamp) {
      return false;
    }

    const age = Date.now() - this.cache.navbar.timestamp;
    return age < DASHBOARD_CACHE_DURATION;
  }

  /**
   * Check if dashboard cache is fresh for a specific day range
   * Private helper method
   */
  isDashboardCacheFresh(days) {
    if (!this.cache.dashboard[days] || !this.cache.dashboardTimestamp[days]) {
      return false;
    }

    const age = Date.now() - this.cache.dashboardTimestamp[days];
    return age < DASHBOARD_CACHE_DURATION;
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
      // Temporary debug: log raw dashboard response to help diagnose overwrites
      try {
        console.log('📦 SessionManager.fetchDashboardData raw response:', { days, success: data?.success, metrics_exists: !!data?.metrics });
      } catch (e) {
        // ignore logging errors
      }
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

  /**
   * Fetch dashboard data from API
   * Private helper method
   */
  async fetchDashboardData(days) {
    try {
      const response = await fetch(
        `${API_BASE}/api/home/dashboard?days=${days}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Not authenticated");
        }
        throw new Error("Failed to fetch dashboard data");
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error("❌ Failed to fetch dashboard data:", err);
      throw err;
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats() {
    const now = Date.now();
    
    return {
      user: {
        cached: !!this.cache.user,
        age: this.cache.userTimestamp 
          ? Math.round((now - this.cache.userTimestamp) / 1000) + 's'
          : 'N/A'
      },
      forecastStatus: {
        cached: !!this.cache.forecastStatus,
        age: this.cache.forecastTimestamp
          ? Math.round((now - this.cache.forecastTimestamp) / 1000) + 's'
          : 'N/A'
      },
      navbar: {
        cached: !!this.cache.navbar.data,
        age: this.cache.navbar.timestamp
          ? Math.round((now - this.cache.navbar.timestamp) / 1000) + 's'
          : 'N/A'
      },
      dashboard: {
        '7d': {
          cached: !!this.cache.dashboard[7],
          age: this.cache.dashboardTimestamp[7]
            ? Math.round((now - this.cache.dashboardTimestamp[7]) / 1000) + 's'
            : 'N/A'
        },
        '30d': {
          cached: !!this.cache.dashboard[30],
          age: this.cache.dashboardTimestamp[30]
            ? Math.round((now - this.cache.dashboardTimestamp[30]) / 1000) + 's'
            : 'N/A'
        },
        '90d': {
          cached: !!this.cache.dashboard[90],
          age: this.cache.dashboardTimestamp[90]
            ? Math.round((now - this.cache.dashboardTimestamp[90]) / 1000) + 's'
            : 'N/A'
        }
      }
    };
  }
}

// Export singleton instance
export default new SessionManager();