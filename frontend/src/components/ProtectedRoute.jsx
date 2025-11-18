// frontend/src/components/ProtectedRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import Swal from "sweetalert2";

const FORECAST_API = "http://localhost:5000/api/forecast/history";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [hasForecast, setHasForecast] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch(FORECAST_API, { credentials: "include" });

        if (res.ok) {
          const data = await res.json();
          setHasForecast(Array.isArray(data) && data.length > 0);
        } else {
          setHasForecast(false);
        }
      } catch (err) {
        console.error("Forecast access error:", err);
        setHasForecast(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, []);

  if (loading) {
    return (
      <div className="center-loading">
        <div className="spinner"></div>
        <p>Checking access...</p>
      </div>
    );
  }

  if (!hasForecast) {
    Swal.fire({
      icon: "info",
      title: "Generate a Forecast First",
      text: "Please upload sales data and generate a forecast.",
      confirmButtonColor: "#001D39",
    });

    return <Navigate to="/welcome" replace />;
  }

  return children;
}
