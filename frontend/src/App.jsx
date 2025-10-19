import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";

import Home from "./pages/Home";
import Data from "./pages/Data";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Login from "./pages/Login";
import "./App.css";

function ProtectedRoute({ children }) {
  const isAuthenticated = localStorage.getItem("authToken"); // check login
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  const location = useLocation();
  const path = location.pathname;

  const useSmallNavbarRoutes = ["/data", "/forecast", "/reports", "/analytics"];
  const noNavbarRoutes = ["/login"];

  const hideNavbar = noNavbarRoutes.includes(path);
  const useSmallNavbar = useSmallNavbarRoutes.includes(path);

  return (
    <>
      {!hideNavbar && (useSmallNavbar ? <Navbar2 /> : <Navbar />)}

      <div className="page-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/data"
            element={
              <ProtectedRoute>
                <Data />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forecast"
            element={
              <ProtectedRoute>
                <Forecast />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </>
  );
}

export default App;
