// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import SessionManager from "../services/sessionManager";
import "../css/Login.css";
const API = import.meta.env.VITE_API_URL;

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
      setRemainingTime((prev) => {
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

    // Show loading indicator
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

      const data = await res.json();

      // ============================================
      // SUCCESS - Initialize session with parallel requests
      // ============================================
      if (res.ok) {
        console.log("🔓 Login successful, initializing session...");
        
        // ✅ Fetch user info + forecast status in PARALLEL
        // This takes ~500ms instead of 2-3 seconds!
        const { forecastStatus } = await SessionManager.initializeSession();
        
        Swal.close();
        
        // Show success message
        await Swal.fire({
          icon: "success",
          title: "Login Successful",
          text: "Welcome back!",
          timer: 1500,
          showConfirmButton: false,
        });

        // Navigate based on forecast status (instant decision - already cached!)
        const destination = forecastStatus.hasForecast ? "/home" : "/welcome";
        console.log(`✅ Navigating to ${destination}`);
        navigate(destination, { replace: true });
        
        return;
      }

      // ============================================
      // ACCOUNT LOCKED (423)
      // ============================================
      if (res.status === 423) {
        const lockSeconds = data.remainingTime || 60;
        setIsLocked(true);
        setRemainingTime(lockSeconds);

        let timerInterval;
        Swal.fire({
          icon: "warning",
          title: "Account Locked",
          html: `Too many failed attempts.<br>Locked for <b>${lockSeconds}</b> seconds.`,
          timer: lockSeconds * 1000,
          timerProgressBar: true,
          showConfirmButton: false,
          willClose: () => clearInterval(timerInterval),
        });

        timerInterval = setInterval(() => {
          const html = Swal.getHtmlContainer();
          if (!html) return;
          const b = html.querySelector("b");
          if (b) b.textContent = Math.ceil(Swal.getTimerLeft() / 1000);
        }, 1000);

        return;
      }

      // ============================================
      // WRONG CREDENTIALS
      // ============================================
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
        text: "Cannot connect to server. Please try again.",
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
            {isLocked
              ? `Account Locked (${formatTime(remainingTime)})`
              : "Login"}
          </button>

          <a href="/forgot" className="forgot">
            Forgot your password?
          </a>
          <a href="/register" className="register">
            Don't have an account? Register here.
          </a>
        </form>
      </div>
    </div>
  );
};

export default Login;