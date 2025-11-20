// frontend/src/pages/LoadingCheck.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

const FORECAST_API = "http://localhost:5000/api/forecast/history";

export default function LoadingCheck() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const checkAndNavigate = async () => {
      try {
        let hasForecast = false;

        // 1. Check cache first (fast path)
        const cached = sessionStorage.getItem("forecastHistory");
        let shouldFetch = true;

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const isFresh = Date.now() - parsed.time < 5 * 60 * 1000; // 5 minutes

            if (isFresh) {
              hasForecast = parsed.hasForecast;
              shouldFetch = false; // Cache is fresh → skip API call
            }
          } catch (e) {
            sessionStorage.removeItem("forecastHistory"); // Corrupted cache
          }
        }

        // 2. Fetch from backend if no fresh cache
        if (shouldFetch) {
          const res = await fetch(FORECAST_API, {
            credentials: "include",
          });

          if (!mounted) return;

          if (res.status === 404) {
            hasForecast = false;
          } else if (res.ok) {
            const data = await res.json();
            hasForecast = Array.isArray(data) && data.length > 0;
          } else {
            // Any other error → treat as no forecast (safe fallback)
            hasForecast = false;
          }

          // Update cache
          sessionStorage.setItem(
            "forecastHistory",
            JSON.stringify({ hasForecast, time: Date.now() })
          );
        }

        // Optional: Minimum loading time to avoid flashing (feels smoother)
        await new Promise((resolve) => setTimeout(resolve, 600));

        if (mounted) {
          navigate(hasForecast ? "/home" : "/welcome");
        }
      } catch (err) {
        console.error("LoadingCheck error:", err);
        if (mounted) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          navigate("/welcome"); // Safe fallback
        }
      }
    };

    checkAndNavigate();

    // Cleanup: prevent navigation if component unmounts
    return () => {
      mounted = false;
    };
  }, [navigate]); // Dependency array is correct

  return <FullScreenLoader message="Preparing your dashboard..." />;
}