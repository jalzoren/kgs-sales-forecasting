import React, { useState } from "react";
import Swal from "sweetalert2"; // ✅ Import SweetAlert2
import "../css/Forgot.css";

export default function Forgot() {
  const [step, setStep] = useState(1); // 1 = email+code, 2 = reset password
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");


  // Handle sending OTP code
  const handleSendCode = async () => {
  if (!email) {
    Swal.fire("Warning", "Please enter your email.", "warning");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    const data = await response.json();

    if (response.ok) {
      setIsCodeSent(true);
      Swal.fire("Success", data.message, "success");
    } else {
      Swal.fire("Error", data.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "Failed to connect to the server.", "error");
  }
};

// Handle verifying code
const handleVerifyCode = async (e) => {
  e.preventDefault();
  if (!code) {
    Swal.fire("Warning", "Please enter the code.", "warning");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await response.json();

    if (response.ok) {
      setStep(2);
      Swal.fire("Success", data.message, "success");
    } else {
      Swal.fire("Error", data.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "Connection failed.", "error");
  }
};

  // Handle resetting password
const handleResetPassword = async (e) => {
  e.preventDefault();

  if (!newPassword || !confirmPassword) {
    Swal.fire("Warning", "Please fill out both fields.", "warning");
    return;
  }
  if (newPassword !== confirmPassword) {
    Swal.fire("Error", "Passwords do not match.", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newPassword }),
    });
    const data = await response.json();

    if (response.ok) {
      Swal.fire({
        icon: "success",
        title: "Password Reset Successful",
        text: data.message,
        confirmButtonColor: "#001D39",
      }).then(() => {
        window.location.href = "/"; // Back to login
      });
    } else {
      Swal.fire("Error", data.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "Failed to connect to the server.", "error");
  }
};

  return (
    <div className="forgot-bg">
      <div className="forgot-container">

        {/* STEP 1: Email + Code */}
        {step === 1 && (
          <form className="forgot-form" onSubmit={handleVerifyCode}>
            <h2 className="title" >Forgot Password</h2>
            <hr />
            <label>Email</label>
            <div className="email-group">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="button"
                className="send-code-btn"
                onClick={handleSendCode}
                disabled={isCodeSent}
              >
                {isCodeSent ? "Code Sent" : "Send Code"}
              </button>
            </div>

            {isCodeSent && (
              <>
                <label>Enter Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
                <button type="submit" className="submit-btn">
                  Verify Code
                </button>
              </>
            )}

            <a href="/" className="back-login">
              Back to Login
            </a>
            {message && <p className="message">{message}</p>}
          </form>
        )}

        {/* STEP 2: Reset Password */}
        {step === 2 && (
          <form className="forgot-form" onSubmit={handleResetPassword}>
            <h2 className="title" >Forgot Password</h2>
            <hr />
            <label>New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <label>Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div className="checkbox-row">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
              />
              <label>Show Password</label>
            </div>
            <button type="submit" className="submit-btn">
              Submit
            </button>
            <p className="back-login" onClick={() => setStep(1)}>
              Back to LogIn
            </p>
            {message && <p className="message">{message}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
