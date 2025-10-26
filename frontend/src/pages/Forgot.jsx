import React, { useState, useEffect } from "react"; // ✅ Add useEffect
import Swal from "sweetalert2";
import "../css/Forgot.css";

export default function Forgot() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  
  // ✅ Add password validation states
  const [passwordErrors, setPasswordErrors] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
  });
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [touched, setTouched] = useState({
    password: false,
    confirmPassword: false,
  });

  // ✅ Password validation criteria (same as Register)
  const passwordCriteria = {
    length: {
      test: (pwd) => pwd.length >= 8,
      message: "At least 8 characters",
    },
    uppercase: {
      test: (pwd) => /[A-Z]/.test(pwd),
      message: "One uppercase letter",
    },
    lowercase: {
      test: (pwd) => /[a-z]/.test(pwd),
      message: "One lowercase letter",
    },
    number: { test: (pwd) => /[0-9]/.test(pwd), message: "One number" },
    specialChar: {
      test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
      message: "One special character",
    },
  };

  // ✅ Validate password in real-time
  useEffect(() => {
    if (newPassword) {
      const newErrors = {};
      Object.keys(passwordCriteria).forEach((key) => {
        newErrors[key] = !passwordCriteria[key].test(newPassword);
      });
      setPasswordErrors(newErrors);
      setIsPasswordValid(!Object.values(newErrors).includes(true));
    } else {
      setPasswordErrors({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        specialChar: false,
      });
      setIsPasswordValid(false);
    }
  }, [newPassword]);

  const handleBlur = (field) => {
    setTouched({
      ...touched,
      [field]: true,
    });
  };

  const getPasswordInputClass = () => {
    if (!touched.password) return "";
    if (!newPassword) return "";
    return isPasswordValid ? "input-valid" : "input-invalid";
  };

  const getConfirmPasswordInputClass = () => {
    if (!touched.confirmPassword) return "";
    if (!confirmPassword) return "";
    return newPassword === confirmPassword ? "input-valid" : "input-invalid";
  };

  // Handle sending OTP code
  const handleSendCode = async () => {
    if (!email) {
      Swal.fire({
        title: "Warning",
        text: "Please enter your email.",
        icon: "warning",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
      return;
    }

    Swal.fire({
      title: 'Sending Code...',
      text: 'Please wait while we send the OTP to your email',
      allowOutsideClick: false,
      customClass: {
        popup: 'swal-centered' // ✅ Add centered class
      },
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const response = await fetch("http://localhost:5000/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      Swal.close();

      if (response.ok) {
        setIsCodeSent(true);
        Swal.fire({
          title: "Success",
          text: data.message,
          icon: "success",
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        });
      } else {
        Swal.fire({
          title: "Error",
          text: data.message,
          icon: "error",
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        });
      }
    } catch (error) {
      Swal.close();
      Swal.fire({
        title: "Error",
        text: "Failed to connect to the server.",
        icon: "error",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
    }
  };

  // Handle verifying code
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code) {
      Swal.fire({
        title: "Warning",
        text: "Please enter the code.",
        icon: "warning",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
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
        Swal.fire({
          title: "Success",
          text: data.message,
          icon: "success",
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        });
      } else {
        Swal.fire({
          title: "Error",
          text: data.message,
          icon: "error",
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        });
      }
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "Connection failed.",
        icon: "error",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
    }
  };

  // Handle resetting password
  const handleResetPassword = async (e) => {
    e.preventDefault();

    // ✅ Add password validation
    if (!newPassword || !confirmPassword) {
      Swal.fire({
        title: "Warning",
        text: "Please fill out both fields.",
        icon: "warning",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
      return;
    }

    if (!isPasswordValid) {
      Swal.fire({
        title: "Error",
        text: "Please fix password validation errors.",
        icon: "error",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      Swal.fire({
        title: "Error",
        text: "Passwords do not match.",
        icon: "error",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
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
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        }).then(() => {
          window.location.href = "/";
        });
      } else {
        Swal.fire({
          title: "Error",
          text: data.message,
          icon: "error",
          customClass: {
            popup: 'swal-centered' // ✅ Add centered class
          }
        });
      }
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "Failed to connect to the server.",
        icon: "error",
        customClass: {
          popup: 'swal-centered' // ✅ Add centered class
        }
      });
    }
  };

  return (
    <div className="forgot-bg">
      <div className="forgot-container">

        {/* STEP 1: Email + Code */}
        {step === 1 && (
          <form className="forgot-form" onSubmit={handleVerifyCode}>
            <h2 className="title">Forgot Password</h2>
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
            <h2 className="title">Forgot Password</h2>
            <hr />
            
            <label>New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              className={getPasswordInputClass()}
              required
            />

            {/* ✅ Password Validation Criteria */}
            {touched.password && newPassword && (
              <div className="password-criteria">
                <h4>Password must contain:</h4>
                <ul>
                  {Object.keys(passwordCriteria).map((key) => (
                    <li
                      key={key}
                      className={
                        passwordErrors[key]
                          ? "criteria-invalid"
                          : "criteria-valid"
                      }
                    >
                      {passwordErrors[key] ? "✗" : "✓"}{" "}
                      {passwordCriteria[key].message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label>Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
              className={getConfirmPasswordInputClass()}
              required
            />

            {/* ✅ Password Match Indicator */}
            {touched.confirmPassword && confirmPassword && (
              <div className="password-match">
                {newPassword === confirmPassword ? (
                  <span className="match-valid">✓ Passwords match</span>
                ) : (
                  <span className="match-invalid">✗ Passwords do not match</span>
                )}
              </div>
            )}

            <div className="checkbox-row">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
              />
              <label>Show Password</label>
            </div>

            <button 
              type="submit" 
              className="submit-btn"
              disabled={!isPasswordValid || newPassword !== confirmPassword}
            >
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