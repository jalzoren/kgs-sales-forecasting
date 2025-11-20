// frontend/src/components/ProtectedRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import Swal from "sweetalert2";

const FORECAST_API = "http://localhost:5000/api/forecast/history";
const CACHE_KEY = "forecastHistory";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [hasForecast, setHasForecast] = useState(null); // null = checking

  useEffect(() => {
    const checkForecast = async () => {
      try {
        // 1. Check cache first (super fast)
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { hasForecast, time } = JSON.parse(cached);
          if (Date.now() - time < CACHE_TTL) {
            setHasForecast(hasForecast);
            setLoading(false);
            return;
          }
        }

        // 2. No fresh cache → hit backend
        const res = await fetch(FORECAST_API, { credentials: "include" });
        const data = await res.json();
        const valid = Array.isArray(data) && data.length > 0;

        // Cache result
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          hasForecast: valid,
          time: Date.now()
        }));

        setHasForecast(valid);
      } catch (err) {
        console.error("Forecast check failed:", err);
        setHasForecast(false);
      } finally {
        setLoading(false);
      }
    };

    checkForecast();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-900 to-black flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-600 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading your forecast...</p>
        </div>
      </div>
    );
  }

  if (!hasForecast) {
    Swal.fire({
      icon: "info",
      title: "No Forecast Yet",
      text: "Please upload sales data and generate your first forecast.",
      confirmButtonColor: "#001D39",
      background: "#ffffffff",
      color: "#4f4f4fff",
    });
    return <Navigate to="/welcome" replace />;
  }

  return children;
}