// controllers/authController.js
const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

class AuthController {
  // =========================
  // REGISTER
  // =========================
  async register(req, res) {
    const { firstName, lastName, email, password, confirmPassword, acceptTerms, acceptPrivacy } = req.body;

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

    if (!acceptTerms || !acceptPrivacy) {
      return res.status(400).json({
        message: "You must accept Terms & Conditions and Privacy Policy",
      });
    }

    try {
      const tableName = process.env.USE_SUPABASE_DB ? '"user"' : 'user';

      // Check if email exists
      const existing = await db.query(`SELECT * FROM ${tableName} WHERE email = ?`, [email]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      const insertQuery = `
        INSERT INTO ${tableName} (firstName, lastName, email, password)
        VALUES (?, ?, ?, ?)
      `;

      const result = await db.query(insertQuery, [firstName, lastName, email, hashedPassword]);

      // Auto-login
      req.session.user = {
        id: result.insertId || result[0]?.id,
        firstName,
        lastName,
        email,
      };

      res.json({ message: "Account created successfully!", user: req.session.user });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Server error during registration" });
    }
  }

  // =========================
  // LOGIN
  // =========================
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    try {
      const tableName = process.env.USE_SUPABASE_DB ? '"user"' : 'user';
      const users = await db.query(`SELECT * FROM ${tableName} WHERE email = ?`, [email]);

      if (users.length === 0) return res.status(404).json({ message: "User not found" });

      const user = users[0];

      // Initialize session attempts if not exists
      if (!req.session.loginAttempts) req.session.loginAttempts = 0;
      if (!req.session.lockUntil) req.session.lockUntil = null;

      const now = new Date();

      // Account lock check
      if (req.session.lockUntil && now < req.session.lockUntil) {
        const remainingTime = Math.ceil((req.session.lockUntil - now) / 1000);
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        return res.status(423).json({
          message: `Account locked. Try again in ${minutes}:${seconds.toString().padStart(2, "0")}.`,
          remainingTime,
        });
      }

      // Reset lock if time passed
      if (req.session.lockUntil && now >= req.session.lockUntil) {
        req.session.loginAttempts = 0;
        req.session.lockUntil = null;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        req.session.loginAttempts += 1;
        if (req.session.loginAttempts >= 3) {
          req.session.lockUntil = new Date(now.getTime() + 60000); // 1 min
          return res.status(423).json({ message: "Too many failed attempts. Account locked for 1 minute.", remainingTime: 60 });
        }
        return res.status(401).json({ message: `Invalid password. ${3 - req.session.loginAttempts} attempts remaining.` });
      }

      // Successful login
      req.session.loginAttempts = 0;
      req.session.lockUntil = null;

      req.session.user = {
        id: user.userId || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      };

      res.json({ message: "Login successful", user: req.session.user });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Server error during login" });
    }
  }

  // =========================
  // CHECK SESSION
  // =========================
  checkSession(req, res) {
    if (req.session.user) {
      return res.json({ loggedIn: true, user: req.session.user });
    }
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
  // FORGOT PASSWORD (SEND CODE)
  // =========================
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 3 * 60000); // 3 minutes
      const tableName = process.env.USE_SUPABASE_DB ? '"user"' : 'user';

      const result = await db.query(
        `UPDATE ${tableName} SET resetCode = ?, codeExpiry = ? WHERE email = ?`,
        [code, expiry, email]
      );

      if (result.affectedRows === 0 && result.rowCount === 0)
        return res.status(404).json({ message: "Email not found" });

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent) return res.status(500).json({ message: "Failed to send email" });

      res.json({ message: "OTP sent to your email" });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Server error during forgot password" });
    }
  }

  // =========================
  // VERIFY CODE
  // =========================
  async verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Missing email or code" });

    try {
      const tableName = process.env.USE_SUPABASE_DB ? '"user"' : 'user';
      const users = await db.query(`SELECT resetCode, codeExpiry FROM ${tableName} WHERE email = ?`, [email]);

      if (users.length === 0) return res.status(404).json({ message: "Email not found" });

      const user = users[0];
      const now = new Date();

      if (user.resetCode !== code) return res.status(401).json({ message: "Invalid code" });
      if (now > user.codeExpiry) return res.status(410).json({ message: "Code expired" });

      res.json({ message: "Code verified successfully" });
    } catch (err) {
      console.error("Verify code error:", err);
      res.status(500).json({ message: "Server error during code verification" });
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

    if (!passwordRegex.test(newPassword))
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
      });

    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      const tableName = process.env.USE_SUPABASE_DB ? '"user"' : 'user';

      const result = await db.query(
        `UPDATE ${tableName} SET password = ?, resetCode = NULL, codeExpiry = NULL WHERE email = ?`,
        [hashed, email]
      );

      if (result.affectedRows === 0 && result.rowCount === 0)
        return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Server error during password reset" });
    }
  }
}

module.exports = new AuthController();
