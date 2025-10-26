import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "../css/Register.css";

const Register = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptterms: false,
    acceptPrivacy: false,
  });
  const [showPassword, setShowPassword] = useState(false);
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
  const navigate = useNavigate();

  // Password validation criteria
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

  // Validate password in real-time
  useEffect(() => {
    if (formData.password) {
      const newErrors = {};
      Object.keys(passwordCriteria).forEach((key) => {
        newErrors[key] = !passwordCriteria[key].test(formData.password);
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
  }, [formData.password]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };

  const handleBlur = (field) => {
    setTouched({
      ...touched,
      [field]: true,
    });
  };

  const getPasswordInputClass = () => {
    if (!touched.password) return "";
    if (!formData.password) return "";
    return isPasswordValid ? "input-valid" : "input-invalid";
  };

  const getConfirmPasswordInputClass = () => {
    if (!touched.confirmPassword) return "";
    if (!formData.confirmPassword) return "";
    return formData.password === formData.confirmPassword
      ? "input-valid"
      : "input-invalid";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mark fields as touched
    setTouched({
      password: true,
      confirmPassword: true,
    });

    // Basic validation
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      Swal.fire("Warning", "Please fill in all required fields.", "warning");
      return;
    }

    if (!isPasswordValid) {
      Swal.fire("Error", "Please fix password validation errors.", "error");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Swal.fire("Error", "Passwords do not match.", "error");
      return;
    }

    // Show loading alert
    Swal.fire({
      title: "Creating Account...",
      text: "Please wait while we create your account",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      // Close loading alert
      Swal.close();

      if (response.ok) {
        Swal.fire({
          icon: "success",
          title: "Registration Successful!",
          text: data.message,
          confirmButtonColor: "#001D39",
        }).then(() => {
          navigate("/home");
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Registration Failed",
          text: data.message || "Failed to create account",
          confirmButtonColor: "#001D39",
        });
      }
    } catch (error) {
      // Close loading alert on error
      Swal.close();
      console.error("Error:", error);
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Cannot connect to the server. Please try again.",
        confirmButtonColor: "#001D39",
      });
    }
  };

  // PRIVACY & TERMS MODALS
  const showTermsModal = () => {
    Swal.fire({
      title: "Terms & Conditions",
      html: `
      <div style="text-align: left; max-height: 400px; overflow-y: auto;">
        <h4>1. Account Responsibilities</h4>
        <p>• You must be 18 years or older to use this service</p>
        <p>• You are responsible for maintaining account security</p>
        <p>• You must provide accurate information during registration</p>
        
        <h4>2. Acceptable Use</h4>
        <p>• Use the service for legitimate business forecasting purposes</p>
        <p>• Do not upload malicious, illegal, or copyrighted content</p>
        <p>• Do not attempt to reverse engineer or hack the system</p>
        
        <h4>3. Service Limitations</h4>
        <p>• Forecasts are predictions, not guarantees of future performance</p>
        <p>• Service availability is on a best-effort basis</p>
        
        <h4>4. Intellectual Property</h4>
        <p>• Our platform and algorithms are proprietary</p>
        <p>⦁	You grant us license to process your data for forecasting</p>
        <p>• You retain all rights to your uploaded business data</p>
        
        <h4>5. Liability</h4>
        <p>• We are not liable for business decisions made based on forecasts</p>
        <p>• Maximum liability is limited to service fees paid</p>
      </div>
    `,
      width: 600,
      confirmButtonColor: "#001D39",
      confirmButtonText: "I Understand",
    });
  };

  const showPrivacyModal = () => {
    Swal.fire({
      title: "Privacy Policy",
      html: `
      <div style="text-align: left; max-height: 400px; overflow-y: auto;">
        <h4>1. Information We Collect</h4>
        <p>• Account Information: Name, email address</p>
        <p>• Business Data: Sales data, inventory information</p>
        <p>• Usage Data: How you interact with our system</p>
        
        <h4>2. How We Use Your Information</h4>
        <p>• To provide and maintain the sales forecasting service</p>
        <p>• To improve and personalize your experience</p>
        <p>• To ensure security and prevent fraud</p>
        <p>• For analytical purposes to enhance our features</p>
        
        <h4>3. Data Protection</h4>
        <p>• All data is encrypted in transit and at rest</p>
        <p>• Regular security audits and monitoring</p>
        <p>• Access controls and authentication measures</p>
        <p>• Data backup and disaster recovery procedures</p>
        
        <h4>4. Data Ownership</h4>
        <p>• You retain full ownership of all your business data</p>
        <p>• We only process your data to provide forecasting services</p>
        <p>• We do not sell or share your data with third parties</p>
        
        <h4>5. Data Retention</h4>
        <p>• Your data is stored as long as your account is active</p>
        <p>• You can export your data at any time</p>
        <p>• Account deletion removes all your personal data</p>
      </div>
    `,
      width: 600,
      confirmButtonColor: "#001D39",
      confirmButtonText: "I Understand",
    });
  };

  return (
    <div className="register-wrapper">
      <div className="register-container">
        <h2 className="Title">Create your Account</h2>

        <form onSubmit={handleSubmit}>
          <div className="name-group">
            <div className="name-field">
              <label htmlFor="firstName">First Name *</label>
              <input
                type="text"
                id="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="name-field">
              <label htmlFor="lastName">Last Name *</label>
              <input
                type="text"
                id="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <label htmlFor="email">Email *</label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <label htmlFor="password">Password *</label>
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            value={formData.password}
            onChange={handleChange}
            onBlur={() => handleBlur("password")}
            className={getPasswordInputClass()}
            required
          />

          {/* Password Validation Criteria */}
          {touched.password && formData.password && (
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

          <label htmlFor="confirmPassword">Confirm Password *</label>
          <input
            type={showPassword ? "text" : "password"}
            id="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            onBlur={() => handleBlur("confirmPassword")}
            className={getConfirmPasswordInputClass()}
            required
          />

          {/* Password Match Indicator */}
          {touched.confirmPassword && formData.confirmPassword && (
            <div className="password-match">
              {formData.password === formData.confirmPassword ? (
                <span className="match-valid">✓ Passwords match</span>
              ) : (
                <span className="match-invalid">✗ Passwords do not match</span>
              )}
            </div>
          )}

          <div className="checkbox">
            <input
              type="checkbox"
              id="showPassword"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
            />
            <label htmlFor="showPassword">Show Password</label>
          </div>

          <button
            type="submit"
            className="create-btn"
            disabled={
              !isPasswordValid ||
              formData.password !== formData.confirmPassword ||
              !formData.acceptTerms ||
              !formData.acceptPrivacy
            }
          >
            Create Account
          </button>

          {/* Terms and Privacy Checkboxes */}
          <div className="terms-section">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={formData.acceptTerms}
                onChange={(e) =>
                  setFormData({ ...formData, acceptTerms: e.target.checked })
                }
                required
              />
              <label htmlFor="acceptTerms">
                I agree to the{" "}
                <span className="link" onClick={() => showTermsModal()}>
                  Terms & Conditions
                </span>
              </label>
            </div>

            <div className="checkbox-group">
              <input
                type="checkbox"
                id="acceptPrivacy"
                checked={formData.acceptPrivacy}
                onChange={(e) =>
                  setFormData({ ...formData, acceptPrivacy: e.target.checked })
                }
                required
              />
              <label htmlFor="acceptPrivacy">
                I agree to the{" "}
                <span className="link" onClick={() => showPrivacyModal()}>
                  Privacy Policy
                </span>
              </label>
            </div>
          </div>

          <a href="/login" className="login">
            Already have an account? Log In Here
          </a>
        </form>
      </div>
    </div>
  );
};

export default Register;
