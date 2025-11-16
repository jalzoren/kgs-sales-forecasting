// frontend/src/App.jsx
import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";
import { NotificationProvider } from "./components/Notifications";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthRoute from "./components/AuthRoute"; // ✅ NEW

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

  const noNavbarPaths = ["/", "/login", "/register", "/forgot"];
  const navbar2Paths = ["/welcome", "/data", "/forecast", "/reports", "/analytics"];
  const navbarPaths = ["/home"];

  return (
    <NotificationProvider>
      {noNavbarPaths.includes(path) ? null : navbar2Paths.includes(path) ? (
        <Navbar2 />
      ) : navbarPaths.includes(path) ? (
        <Navbar />
      ) : null}

      <div className={`page-container ${noNavbarPaths.includes(path) ? "no-navbar" : ""}`}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />
          
          {/* Welcome page - requires authentication only */}
          <Route path="/welcome" element={
            <AuthRoute>
              <Welcome />
            </AuthRoute>
          } />
          
          {/* Data page - requires authentication */}
          <Route path="/data" element={
            <AuthRoute>
              <Data />
            </AuthRoute>
          } />
          
          {/* Protected routes - requires authentication + forecast */}
          <Route path="/home" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
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
        </Routes>
      </div>
    </NotificationProvider>
  );
}

export default App;