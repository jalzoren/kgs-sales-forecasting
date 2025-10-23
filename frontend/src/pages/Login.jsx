import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2"; 
import "../css/Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const [isLocked, setIsLocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (isLocked && remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime(prev => {
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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };


const handleSubmit = async (e) => {
  e.preventDefault();

  // Don't allow submission if locked
  if (isLocked) {
    Swal.fire({
      icon: "warning",
      title: "Account Locked",
      text: `Please wait ${formatTime(remainingTime)} before trying again.`,
      confirmButtonColor: "#001D39",
    });
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
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
      // Handle account lockout
      if (response.status === 423) {
        setIsLocked(true);
        setRemainingTime(data.remainingTime || 60);
        
        Swal.fire({
          icon: "warning",
          title: "Account Locked",
          text: data.message || "Too many failed attempts. Account locked for 1 minute.",
          confirmButtonColor: "#001D39",
        });
      } else {
        // Update attempts left for regular failed attempts
        const newAttemptsLeft = attemptsLeft - 1;
        setAttemptsLeft(newAttemptsLeft);
        
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: data.message || "Invalid email or password",
          confirmButtonColor: "#001D39",
          footer: newAttemptsLeft > 0 ? 
            `${newAttemptsLeft} attempt${newAttemptsLeft > 1 ? 's' : ''} remaining` : 
            'No attempts remaining'
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

        {/* Lockout Countdown Display */}
        {isLocked && (
          <div className="lockout-warning">
            <div className="countdown-timer">
              <div className="timer-icon">⏰</div>
              <div className="timer-text">
                <strong>Account Locked</strong>
                <p>Try again in: {formatTime(remainingTime)}</p>
              </div>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${((60 - remainingTime) / 60) * 100}%`,
                  backgroundColor: '#ff6b6b'
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Attempts Counter */}
        {!isLocked && attemptsLeft < 3 && (
          <div className="attempts-warning">
            <span className="attempts-count">
              {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
            </span>
          </div>
        )}

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

          <button type="submit" className="login-btn" disabled={isLocked}>
            {isLocked ? `Locked (${formatTime(remainingTime)})` : 'Login'}
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
