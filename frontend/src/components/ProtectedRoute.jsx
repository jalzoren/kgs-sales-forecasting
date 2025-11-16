// frontend/src/components/ProtectedRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import Swal from "sweetalert2";

export default function ProtectedRoute({ children }) {
  const [hasForecast, setHasForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkForecastAccess();
  }, []);

  const checkForecastAccess = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/forecast/history", {
        credentials: "include",
      });
      
      // ✅ Check both status and data content
      if (res.ok) {
        const data = await res.json();
        const hasForecasts = Array.isArray(data) && data.length > 0;
        setHasForecast(hasForecasts);
      } else {
        setHasForecast(false);
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Error checking forecast access:", err);
      setHasForecast(false);
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
        <p>Checking access...</p>
      </div>
    );
  }

  if (!hasForecast) {
    // Show message and redirect
    Swal.fire({
      icon: "info",
      title: "Generate a Forecast First",
      text: "Please upload sales data and generate a forecast to access the dashboard.",
      confirmButtonColor: "#001D39",
      confirmButtonText: "Go to Welcome Page"
    });
    return <Navigate to="/welcome" replace />;
  }

  return children;
}