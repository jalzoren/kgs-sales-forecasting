// frontend/src/components/ProtectedRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import SessionManager from "../services/sessionManager";
import Swal from "sweetalert2";

/**
 * ProtectedRoute - FAST protection using cached session data
 * No API calls needed - relies on SessionManager cache from login
 * 
 * Performance: <50ms (instant with cache)
 */
export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      // ✅ Uses cache - NO API call if data is fresh (from login)
      // This is INSTANT because login already fetched the data!
      const status = await SessionManager.getForecastStatus();
      
      console.log('🔒 ProtectedRoute check (cached):', status);

      if (status.hasForecast) {
        setIsAuthorized(true);
      } else {
        // User needs to generate forecast first
        setIsAuthorized(false);
        
        Swal.fire({
          icon: "info",
          title: "No Forecast Yet",
          text: "Please upload sales data and generate your first forecast.",
          confirmButtonColor: "#001D39",
        });
      }
    } catch (err) {
      console.error("❌ Authorization check failed:", err);
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  // Minimal loading state (usually <50ms with cache)
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(to bottom right, #1e3a8a, #000000)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            border: '4px solid #4b5563',
            borderTopColor: '#22d3ee',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
        </div>
      </div>
    );
  }

  // Redirect to welcome if no forecast
  if (!isAuthorized) {
    return <Navigate to="/welcome" replace />;
  }

  // Render protected content
  return children;
}