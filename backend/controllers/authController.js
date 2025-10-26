// controllers/authController.js
// login, forgot, verify, and reset password logic
const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

class AuthController {
  async register(req, res) {
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;

    // Validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
      });
    }

    /*
    // Add this check after other validations
    if (!acceptTerms || !acceptPrivacy) {
      return res.status(400).json({
        message: "You must accept Terms & Conditions and Privacy Policy",
      });
    }*/

    try {
      // Check if email already exists
      db.query(
        "SELECT * FROM user WHERE email = ?",
        [email],
        async (err, results) => {
          if (err) return res.status(500).json({ message: "Database error" });

          if (results.length > 0) {
            return res
              .status(409)
              .json({ message: "Email already registered" });
          }

          // Hash password
          const hashedPassword = await bcrypt.hash(password, 10);

          // Insert new user
          const insertQuery = `
        INSERT INTO user (firstName, lastName, email, password) 
        VALUES (?, ?, ?, ?)
      `;

          db.query(
            insertQuery,
            [firstName, lastName, email, hashedPassword],
            (err, result) => {
              if (err) {
                console.error("Registration error:", err);
                return res
                  .status(500)
                  .json({ message: "Failed to create account" });
              }

              // Auto-login after registration
              req.session.user = {
                id: result.insertId,
                email: email,
                firstName: firstName,
                lastName: lastName,
              };

              res.json({
                message: "Account created successfully!",
                user: req.session.user,
              });
            }
          );
        }
      );
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Server error during registration" });
    }
  }

  // LOGIN
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    db.query(
      "SELECT * FROM user WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (results.length === 0)
          return res.status(404).json({ message: "User not found" });

        const user = results[0];

        // Initialize session attempts if not exists
        if (!req.session.loginAttempts) {
          req.session.loginAttempts = 0;
        }
        if (!req.session.lockUntil) {
          req.session.lockUntil = null;
        }

        const now = new Date();

        // Check if account is locked in session
        if (req.session.lockUntil && now < req.session.lockUntil) {
          const remainingTime = Math.ceil((req.session.lockUntil - now) / 1000);
          const minutes = Math.floor(remainingTime / 60);
          const seconds = remainingTime % 60;

          return res.status(423).json({
            message: `Account locked. Try again in ${minutes}:${seconds
              .toString()
              .padStart(2, "0")}.`,
            remainingTime: remainingTime,
          });
        }

        // Reset lock if time has passed
        if (req.session.lockUntil && now >= req.session.lockUntil) {
          req.session.loginAttempts = 0;
          req.session.lockUntil = null;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          // Increment login attempts in session
          req.session.loginAttempts += 1;
          let lockUntil = null;

          // Lock account after 3 failed attempts for 1 minute
          if (req.session.loginAttempts >= 3) {
            lockUntil = new Date(now.getTime() + 60000); // 1 minute
            req.session.lockUntil = lockUntil;
          }

          let message = `Invalid password. ${
            3 - req.session.loginAttempts
          } attempts remaining.`;
          if (lockUntil) {
            const remainingTime = 60; // 60 seconds
            message = "Too many failed attempts. Account locked for 1 minute.";

            return res.status(423).json({
              message,
              remainingTime: remainingTime,
            });
          }

          return res.status(401).json({ message });
        }

        // Successful login - reset session attempts
        req.session.loginAttempts = 0;
        req.session.lockUntil = null;

        // Store user info in session
        req.session.user = {
          id: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        };

        res.json({ message: "Login successful", user: req.session.user });
      }
    );
  }

  // CHECK SESSION
  checkSession(req, res) {
    if (req.session.user) {
      res.json({ loggedIn: true, user: req.session.user });
    } else {
      res.json({ loggedIn: false });
    }
  }

  // LOGOUT
  logout(req, res) {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  }

  // SEND RESET CODE
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 3 * 60000);

    db.query(
      "UPDATE user SET resetCode = ?, codeExpiry = ? WHERE email = ?",
      [code, expiry, email],
      async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (result.affectedRows === 0)
          return res.status(404).json({ message: "Email not found" });

        const emailSent = await mailService.sendResetCode(email, code);
        if (!emailSent)
          return res.status(500).json({ message: "Failed to send email" });

        res.json({ message: "OTP sent to your email" });
      }
    );
  }

  // VERIFY CODE
  verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ message: "Missing email or code" });

    db.query(
      "SELECT resetCode, codeExpiry FROM user WHERE email = ?",
      [email],
      (err, results) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (results.length === 0)
          return res.status(404).json({ message: "Email not found" });

        const user = results[0];
        const now = new Date();

        if (user.resetCode !== code)
          return res.status(401).json({ message: "Invalid code" });

        if (now > user.codeExpiry)
          return res.status(410).json({ message: "Code expired" });

        res.json({ message: "Code verified successfully" });
      }
    );
  }

  // RESET PASSWORD
  async resetPassword(req, res) {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
      return res.status(400).json({ message: "Missing data" });

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
      });
    }

    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      db.query(
        "UPDATE user SET password = ?, resetCode = NULL, codeExpiry = NULL WHERE email = ?",
        [hashed, email],
        (err, result) => {
          if (err) return res.status(500).json({ message: "Database error" });
          if (result.affectedRows === 0)
            return res.status(404).json({ message: "Email not found" });

          res.json({ message: "Password reset successfully" });
        }
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Hashing error" });
    }
  }
}

module.exports = new AuthController();
