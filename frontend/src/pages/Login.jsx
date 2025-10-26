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
        Swal.fire({
          icon: "success",
          title: "Login Successful",
          text: "Welcome back!",
          confirmButtonColor: "#001D39",
        }).then(() => {
          navigate("/home");
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

          // Update the timer every second
          timerInterval = setInterval(() => {
            Swal.getHtmlContainer().querySelector("b").textContent = Math.ceil(
              Swal.getTimerLeft() / 1000
            ).toString();
          }, 1000);
        } else {
          // Regular failed attempt
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
        </form>
      </div>
    </div>
  );
};

export default Login;
