import React, { useState } from "react";
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
      setMessage("Please enter your email.");
      return;
    }
    // Later you’ll integrate this with backend API
    setIsCodeSent(true);
    setMessage("Code sent to your email (simulated).");
  };

  // Handle verifying code
  const handleVerifyCode = async (e) => {
    e.preventDefault();

    if (!code) {
      setMessage("Please enter the code sent to your email.");
      return;
    }

    // Simulated verification
    setStep(2);
    setMessage("Code verified! You can now reset your password.");
  };

  // Handle resetting password
  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setMessage("Please fill out both fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    // Later you’ll call backend API here
    setMessage("✅ Password reset successfully!");
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

            <p className="back-login">Back to LogIn</p>
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
