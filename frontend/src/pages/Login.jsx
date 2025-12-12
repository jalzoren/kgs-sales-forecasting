// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import SessionManager from "../services/sessionManager";
import "../css/Login.css";

// Ensure no trailing slash issues
const API = import.meta.env.VITE_API_URL.replace(/\/+$/, "");

const LOGIN_API = `${API}/login`;

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  // Countdown effect for lockout
  useEffect(() => {
    if (!isLocked || remainingTime <= 0) return;
    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          setIsLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isLocked, remainingTime]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) {
      Swal.fire({
        icon: "warning",
        title: "Account Locked",
        html: `Please wait <b>${formatTime(remainingTime)}</b> before trying again.`,
        confirmButtonColor: "#001D39",
      });
      return;
    }

    Swal.fire({
      title: "Logging in...",
      html: "Preparing your dashboard",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch(LOGIN_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        data = await res.json();
      } catch (_) {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text);
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: "Server returned an unexpected response. Please try again.",
          confirmButtonColor: "#001D39",
        });
        return;
      }

      if (res.ok) {
        console.log("🔓 Login successful, initializing session...");
        const { forecastStatus } = await SessionManager.initializeSession();
        Swal.close();
        await Swal.fire({
          icon: "success",
          title: "Login Successful",
          text: "Welcome back!",
          timer: 1500,
          showConfirmButton: false,
        });
        navigate(forecastStatus.hasForecast ? "/home" : "/welcome", { replace: true });
        return;
      }

      if (res.status === 423) {
        const lockSeconds = data.remainingTime || 60;
        setIsLocked(true);
        setRemainingTime(lockSeconds);
        Swal.fire({
          icon: "warning",
          title: "Account Locked",
          html: `Too many failed attempts.<br>Locked for <b>${lockSeconds}</b> seconds.`,
          timer: lockSeconds * 1000,
          timerProgressBar: true,
          showConfirmButton: false,
        });
        return;
      }

      Swal.fire({
        icon: "error",
        title: "Login Failed",
        text: data.message || "Invalid email or password",
        confirmButtonColor: "#001D39",
      });

    } catch (err) {
      console.error("❌ Login error:", err);
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Cannot connect to server. Please check your internet or server status.",
        confirmButtonColor: "#001D39",
      });
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-container">
        <h2 className="Title">Log In</h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLocked}
          />

          <label htmlFor="password">Password</label>
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLocked}
          />

          <div className="checkbox">
            <input
              type="checkbox"
              id="showPassword"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
              disabled={isLocked}
            />
            <label htmlFor="showPassword">Show Password</label>
          </div>

          <button
            type="submit"
            className={`login-btn ${isLocked ? "disabled" : ""}`}
            disabled={isLocked}
          >
            {isLocked ? `Account Locked (${formatTime(remainingTime)})` : "Login"}
          </button>

          <a href="/forgot" className="forgot">Forgot your password?</a>
          <a href="/register" className="register">Don't have an account? Register here.</a>
        </form>
      </div>
    </div>
  );
};

export default Login;
