// frontend/src/components/AuthRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;

export default function AuthRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // ✅ Use your existing check-session endpoint
      const res = await fetch(`${API}/check-session`, {
        credentials: "include",
      });
      
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.loggedIn === true);
      } else {
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Auth check failed:", err);
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}