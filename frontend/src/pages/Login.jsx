// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "../css/Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const navigate = useNavigate();

  // Countdown effect for lockout
  useEffect(() => {
    let timer;
    if (isLocked && remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLocked, remainingTime]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ✅ Check if user has forecasts to determine redirect
  const checkUserStatus = async () => {
    try {
      console.log("🔍 Checking user forecast status...");
      
      const forecastRes = await fetch("http://localhost:5000/api/forecast/history", {
        credentials: "include",
      });
      
      console.log("📡 Forecast API response status:", forecastRes.status);
      
      // ✅ Check for 404 (no forecasts) or check if array is empty
      if (forecastRes.status === 404) {
        console.log("ℹ️ No forecast found (404) - redirecting to /welcome");
        return "/welcome";
      }
      
      if (forecastRes.ok) {
        try {
          const data = await forecastRes.json();
          console.log("📊 Forecast data:", data);
          
          // ✅ Check if user actually has forecast data
          if (Array.isArray(data) && data.length > 0) {
            console.log("✅ User has forecast - redirecting to /home");
            return "/home";
          } else {
            console.log("ℹ️ User has no forecasts (empty array) - redirecting to /welcome");
            return "/welcome";
          }
        } catch (parseErr) {
          console.error("❌ Error parsing forecast response:", parseErr);
          return "/welcome";
        }
      } else {
        console.log(`⚠️ Forecast check returned ${forecastRes.status} - redirecting to /welcome`);
        return "/welcome";
      }
    } catch (err) {
      console.error("❌ Error checking user status:", err);
      return "/welcome";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLocked) {
      Swal.fire({
        icon: "warning",
        title: "Account Locked",
        html: `Please wait <b>${formatTime(
          remainingTime
        )}</b> before trying again.`,
        confirmButtonColor: "#001D39",
      });
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Check user status and redirect accordingly
        const redirectPath = await checkUserStatus();
        
        Swal.fire({
          icon: "success",
          title: "Login Successful",
          text: "Welcome back!",
          confirmButtonColor: "#001D39",
        }).then(() => {
          navigate(redirectPath); // ✅ Smart redirect
        });
      } else {
        // Handle account lockout with SweetAlert countdown
        if (response.status === 423) {
          setIsLocked(true);
          const lockTime = data.remainingTime || 60;
          setRemainingTime(lockTime);

          let timerInterval;
          Swal.fire({
            icon: "warning",
            title: "Account Locked",
            html: `Too many failed attempts. Account locked for <b>${lockTime}</b> seconds.`,
            timer: lockTime * 1000,
            timerProgressBar: true,
            showConfirmButton: false,
            willClose: () => {
              clearInterval(timerInterval);
            },
          });

          timerInterval = setInterval(() => {
            Swal.getHtmlContainer().querySelector("b").textContent = Math.ceil(
              Swal.getTimerLeft() / 1000
            ).toString();
          }, 1000);
        } else {
          Swal.fire({
            icon: "error",
            title: "Login Failed",
            text: data.message || "Invalid email or password",
            confirmButtonColor: "#001D39",
          });
        }
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Cannot connect to the server. Please try again.",
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
            Forgot the password?
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