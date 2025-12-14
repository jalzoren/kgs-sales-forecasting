// controllers/authController.js
const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

class AuthController {
  // =========================
  // REGISTER
  // =========================
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

    try {
      // Check if email exists
      const existing = await db.query('SELECT * FROM "user" WHERE email = $1', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      const insertQuery = `
        INSERT INTO "user" (firstname, lastname, email, password)
        VALUES ($1, $2, $3, $4)
        RETURNING userid, firstname, lastname, email
      `;
      const result = await db.query(insertQuery, [firstName, lastName, email, hashedPassword]);

      // Auto-login
      req.session.user = {
        id: result[0].userid,
        firstName: result[0].firstname,
        lastName: result[0].lastname,
        email: result[0].email,
      };

      res.json({ message: "Account created successfully!", user: req.session.user });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Server error during registration", error: err.message });
    }
  }

  // =========================
  // LOGIN
  // =========================
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing email or password" });

    try {
      const users = await db.query('SELECT * FROM "user" WHERE email = $1', [email]);
      if (users.length === 0) return res.status(404).json({ message: "User not found" });

      const user = users[0];

      // Initialize session attempts
      if (!req.session.loginAttempts) req.session.loginAttempts = 0;
      if (!req.session.lockUntil) req.session.lockUntil = null;
      const now = new Date();

      // Account lock check
      if (req.session.lockUntil && now < req.session.lockUntil) {
        const remainingTime = Math.ceil((req.session.lockUntil - now) / 1000);
        return res.status(423).json({ message: `Account locked. Try again in ${remainingTime} seconds.` });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        req.session.loginAttempts += 1;
        if (req.session.loginAttempts >= 3) {
          req.session.lockUntil = new Date(now.getTime() + 60000); // 1 min
          return res.status(423).json({ message: "Too many failed attempts. Account locked for 1 minute." });
        }
        return res.status(401).json({ message: `Invalid password. ${3 - req.session.loginAttempts} attempts remaining.` });
      }

      // Successful login
      req.session.loginAttempts = 0;
      req.session.lockUntil = null;
      req.session.user = {
        id: user.userid,
        firstName: user.firstname,
        lastName: user.lastname,
        email: user.email,
      };

      res.json({ message: "Login successful", user: req.session.user });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Server error during login", error: err.message });
    }
  }

  // =========================
  // CHECK SESSION
  // =========================
  checkSession(req, res) {
    if (req.session.user) return res.json({ loggedIn: true, user: req.session.user });
    res.json({ loggedIn: false });
  }

  // =========================
  // LOGOUT
  // =========================
  async logout(req, res) {
    try {
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ message: "Server error during logout" });
    }
  }

  // =========================
  // FORGOT PASSWORD
  // =========================
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 3 * 60000); // 3 min

    try {
      const update = await db.query(
        'UPDATE "user" SET resetcode = $1, codeexpiry = $2 WHERE email = $3 RETURNING userid',
        [code, expiry, email]
      );
      if (update.length === 0) return res.status(404).json({ message: "Email not found" });

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent) return res.status(500).json({ message: "Failed to send email" });

      res.json({ message: "OTP sent to your email" });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Server error during forgot password", error: err.message });
    }
  }

  // =========================
  // VERIFY CODE
  // =========================
  async verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Missing email or code" });

    try {
      const users = await db.query(
        'SELECT resetcode, codeexpiry FROM "user" WHERE email = $1',
        [email]
      );
      if (!users || users.length === 0) return res.status(404).json({ message: "Email not found" });

      const user = users[0];
      const now = new Date();
      if (user.resetcode !== code) return res.status(401).json({ message: "Invalid code" });
      if (now > new Date(user.codeexpiry)) return res.status(410).json({ message: "Code expired" });

      res.json({ message: "Code verified successfully" });
    } catch (err) {
      console.error("Verify code error:", err);
      res.status(500).json({ message: "Server error during code verification", error: err.message });
    }
  }

  // =========================
  // RESET PASSWORD
  // =========================
  async resetPassword(req, res) {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: "Missing data" });

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;
    if (!passwordRegex.test(newPassword)) return res.status(400).json({
      message: "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
    });

    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      const update = await db.query(
        'UPDATE "user" SET password = $1, resetcode = NULL, codeexpiry = NULL WHERE email = $2 RETURNING userid',
        [hashed, email]
      );
      if (update.length === 0) return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Server error during password reset", error: err.message });
    }
  }
}

module.exports = new AuthController();
