// frontend/src/App.jsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";
import { NotificationProvider } from "./components/Notifications";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthRoute from "./components/AuthRoute";
import LoadingCheck from "./pages/LoadingCheck";

import Home from "./pages/Home";
import Data from "./pages/Data";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Login from "./pages/Login";
import Forgot from "./pages/Forgot";
import Register from "./pages/Register";
import Welcome from "./pages/Welcome";

import "./App.css";

function App() {
  const location = useLocation();
  const path = location.pathname;

  const noNavbarPaths = ["/", "/login", "/register", "/forgot", "/loading-check"];
  const navbar2Paths = ["/welcome", "/data", "/forecast", "/reports", "/analytics"];
  const navbarPaths = ["/home"];

  const showNavbar = () => {
    if (noNavbarPaths.includes(path)) return null;
    if (navbar2Paths.includes(path)) return <Navbar2 />;
    if (navbarPaths.includes(path)) return <Navbar />;
    return null;
  };

  return (
    <NotificationProvider>
      {showNavbar()}

      <div className={`page-container ${noNavbarPaths.includes(path) ? "no-navbar" : ""}`}>
        <Routes>
          {/* Public Roautes */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />

          {/* === THIS IS THE MAGIC LINE === */}
          {/* Every authenticated user MUST go through LoadingCheck first */}
          <Route 
            path="/loading-check" 
            element={
              <AuthRoute>
                <LoadingCheck />
              </AuthRoute>
            } 
          />

          {/* After login → always redirect here first */}
          <Route 
            path="/dashboard" 
            element={
              <AuthRoute>
                <Navigate to="/loading-check" replace />
              </AuthRoute>
            } 
          />

          {/* Protected Pages — now safe because LoadingCheck already ran */}
          <Route path="/welcome" element={
            <AuthRoute>
              <Welcome />
            </AuthRoute>
          } />

          <Route path="/home" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />

          <Route path="/data" element={
            <AuthRoute>
              <Data />
            </AuthRoute>
          } />

          <Route path="/forecast" element={
            <ProtectedRoute>
              <Forecast />
            </ProtectedRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          } />

          <Route path="/analytics" element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          } />

          {/* Catch-all: redirect to loading check if authenticated */}
          <Route path="*" element={
            <AuthRoute>
              <Navigate to="/loading-check" replace />
            </AuthRoute>
          } />
        </Routes>
      </div>
    </NotificationProvider>
  );
}

export default App;