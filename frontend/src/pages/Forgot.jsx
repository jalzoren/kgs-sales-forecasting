import React, { useState } from "react";
import "../css/Forgot.css";


const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1 = email, 2 = code, 3 = reset
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  // Step 1: Send code
  const handleSendCode = async () => {
    if (!email) {
      setMessage("Please enter your email.");
      return;
    }
    setMessage("Code sent to your email (simulated).");
    setStep(2);
  };

  // Step 2: Verify code
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code) {
      setMessage("Please enter the code sent to your email.");
      return;
    }
    setMessage("Code verified. You can now reset your password.");
    setStep(3);
  };

  // Step 3: Reset password
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
    setMessage("✅ Password reset successfully!");
  };

  return (
    <div className="forgot-bg">
      <div className="forgot-container">
      {step === 1 && (
        <div className="forgot-form">
          <h2>Forgot Password</h2>
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
            >
              Send Code
            </button>
          </div>

          <button className="submit-btn" onClick={() => setStep(2)}>
            Next
          </button>
          <p className="back-login">Back to LogIn</p>
          {message && <p className="message">{message}</p>}
        </div>
      )}

      {step === 2 && (
        <form className="forgot-form" onSubmit={handleVerifyCode}>
          <h2>Forgot Password</h2>
          <hr />
          <label>Email</label>
          <input type="email" value={email} readOnly />
          <label>Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button type="submit" className="submit-btn">
            Submit
          </button>
          <p className="back-login" onClick={() => setStep(1)}>
            Back to LogIn
          </p>
          {message && <p className="message">{message}</p>}
        </form>
      )}

      {step === 3 && (
        <form className="forgot-form" onSubmit={handleResetPassword}>
          <h2>Forgot Password</h2>
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
};

export default Forgot;
