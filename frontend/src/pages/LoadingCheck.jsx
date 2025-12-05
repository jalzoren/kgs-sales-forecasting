// frontend/src/pages/LoadingCheck.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SessionManager from "../services/sessionManager";

/**
 * LoadingCheck - Lightweight navigation helper
 * Uses cached data from login - NO API calls needed!
 * 
 * Performance: Instant decision + 500ms animation = Total 500ms
 */
export default function LoadingCheck() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const determineDestination = async () => {
      try {
        console.log('🔍 LoadingCheck: Reading cached session data...');
        
        // ✅ Uses cache - INSTANT because login already fetched it!
        const status = await SessionManager.getForecastStatus();
        
        console.log('📊 Cached forecast status:', status);
        
        // Determine destination
        const dest = status.hasForecast ? "/home" : "/welcome";
        setDestination(dest);
        
        // Small delay for smooth UX (500ms animation)
        setTimeout(() => {
          if (isMounted) {
            console.log(`✅ Navigating to ${dest}`);
            navigate(dest, { replace: true });
          }
        }, 500);

      } catch (err) {
        console.error('❌ LoadingCheck error:', err);
        
        // Fallback: new users go to welcome
        setTimeout(() => {
          if (isMounted) {
            console.log('⚠️ Error occurred, defaulting to /welcome');
            navigate("/welcome", { replace: true });
          }
        }, 500);
      }
    };

    determineDestination();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // Simple loading animation (500ms only!)
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        width: '80px',
        height: '80px',
        border: '8px solid rgba(255, 255, 255, 0.2)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '24px'
      }}></div>
      
      <h2 style={{
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '8px'
      }}>
        {destination === "/home" ? "Loading Dashboard..." : "Setting Up Your Experience..."}
      </h2>
      
      <p style={{
        fontSize: '16px',
        opacity: 0.8
      }}>
        Just a moment...
      </p>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}