// frontend/src/pages/LoadingCheck.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullScreenLoader from "../components/FullScreenLoader.jsx";

const FORECAST_API = "http://localhost:5000/api/forecast/history";
const NAVIGATE_AFTER = 5_000;   // Navigate after 5 seconds
const LOADER_DURATION = 35_000; // Loader stays for 35 seconds

export default function LoadingCheck() {
  const navigate = useNavigate();
  const [hasNavigated, setHasNavigated] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const runValidation = async () => {
      try {
        const res = await fetch(FORECAST_API, { credentials: "include" });
        let hasForecast = false;

        if (res.status === 404) {
          hasForecast = false;
        } else if (res.ok) {
          const data = await res.json();
          hasForecast = Array.isArray(data) && data.length > 0;
        }

        sessionStorage.setItem("forecastHistory", JSON.stringify({
          hasForecast,
          time: Date.now()
        }));

        // Navigate after 5 seconds (even if loader still showing)
        setTimeout(() => {
          if (isMounted) {
            setHasNavigated(true);
            navigate(hasForecast ? "/home" : "/welcome", { replace: true });
          }
        }, NAVIGATE_AFTER);

      } catch (err) {
        sessionStorage.setItem("forecastHistory", JSON.stringify({
          hasForecast: false,
          time: Date.now()
        }));

        setTimeout(() => {
          if (isMounted) {
            setHasNavigated(true);
            navigate("/welcome", { replace: true });
          }
        }, NAVIGATE_AFTER);
      }
    };

    runValidation();

    // Keep loader for full 35 seconds no matter what
    const hideLoaderTimer = setTimeout(() => {
      if (isMounted) setShowLoader(false);
    }, LOADER_DURATION);

    return () => {
      isMounted = false;
      clearTimeout(hideLoaderTimer);
    };
  }, [navigate]);

  // Show loader for 35 seconds
  // But render the target page underneath after 5 seconds
  return (
    <>
      {/* This renders /home or /welcome after 5 seconds */}
      {hasNavigated && <Outlet />}

      {/* This beautiful loader stays on top for full 35 seconds */}
      {showLoader && (
        <FullScreenLoader
          message="Accessing your forecast data..."
          duration={LOADER_DURATION}
        />
      )}
    </>
  );
}