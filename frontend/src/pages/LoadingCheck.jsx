// frontend/src/pages/LoadingCheck.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

const FORECAST_API = "http://localhost:5000/api/forecast/history";

export default function LoadingCheck() {
  const navigate = useNavigate();

  useEffect(() => {
    const runCheck = async () => {
      try {
        // -------------------------------
        // 1. Use cached data if valid
        // -------------------------------
        const cached = sessionStorage.getItem("forecastHistory");

        if (cached) {
          const parsed = JSON.parse(cached);
          const isFresh = Date.now() - parsed.time < 5 * 60 * 1000;

          if (isFresh) {
            return navigate(parsed.hasForecast ? "/home" : "/welcome");
          }
        }

        // -------------------------------
        // 2. Fetch from backend
        // -------------------------------
        const res = await fetch(FORECAST_API, {
          credentials: "include",
        });

        if (res.status === 404) {
          sessionStorage.setItem(
            "forecastHistory",
            JSON.stringify({ hasForecast: false, time: Date.now() })
          );
          return navigate("/welcome");
        }

        const data = await res.json();
        const hasForecast = Array.isArray(data) && data.length > 0;

        sessionStorage.setItem(
          "forecastHistory",
          JSON.stringify({ hasForecast, time: Date.now() })
        );

        navigate(hasForecast ? "/home" : "/welcome");
      } catch {
        navigate("/welcome");
      }
    };

    runCheck();
  }, [navigate]);

  return <FullScreenLoader message="Preparing your dashboard..." />;
}
