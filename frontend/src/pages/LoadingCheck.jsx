// frontend/src/pages/LoadingCheck.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

const FORECAST_API = "http://localhost:5000/api/forecast/history";

export default function LoadingCheck() {
  const navigate = useNavigate();
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Optional: Enforce a minimum loading time (e.g. 600ms) to avoid flashing
    const minTimer = setTimeout(() => {
      if (mounted) setMinTimePassed(true);
    }, 600); // Adjust as needed (600ms feels smooth)

    const runCheck = async () => {
      try {
        // 1. Check cache first (instant)
        const cached = sessionStorage.getItem("forecastHistory");
        if (cached) {
          const parsed = JSON.parse(cached);
          const isFresh = Date.now() - parsed.time < 5 * 60 * 1000; // 5 min

          if (isFresh) {
            // Wait for minimum time, then navigate
            if (minTimePassed || Date.now() - parsed.time > 600) {
              return navigate(parsed.hasForecast ? "/home" : "/welcome");
            }
            // Otherwise wait for minTimePassed to become true
            const checkAgain = () => {
              if (minTimePassed && mounted) {
                navigate(parsed.hasForecast ? "/home" : "/welcome");
              }
            };
            // Poll until min time passed
            const interval = setInterval(checkAgain, 50);
            return () => clearInterval(interval);
          }
        }

        // 2. No fresh cache → fetch from backend
        const res = await fetch(FORECAST_API, {
          credentials: "include",
        });

        if (!mounted) return;

        let hasForecast = false;

        if (res.status === 404) {
          hasForecast = false;
        } else {
          const data = await res.json();
          hasForecast = Array.isArray(data) && data.length > 0;
        }

        // Cache result
        sessionStorage.setItem(
          "forecastHistory",
          JSON.stringify({ hasForecast, time: Date.now() })
        );

        // Only navigate when minimum time has passed
        if (minTimePassed) {
          navigate(hasForecast ? "/home" : "/welcome");
        } else {
          // Wait until minTimePassed becomes true
          const check = setInterval(() => {
            if (minTimePassed && mounted) {
              clearInterval(check);
              navigate(hasForecast ? "/home" : "/welcome");
            }
          }, 50);
        }

      } catch (err) {
        if (mounted && minTimePassed) {
          navigate("/welcome");
        }
      }
    };

    runCheck();

    return () => {
      mounted = false;
      clearTimeout(minTimer);
    };
  }, [navigate, minTimePassed]);

  return <FullScreenLoader message="Preparing your dashboard..." />;
}