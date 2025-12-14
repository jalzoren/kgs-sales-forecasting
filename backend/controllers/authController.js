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
      const usingPostgres = process.env.USE_SUPABASE_DB === "true";
      const tableName = usingPostgres ? '"user"' : "user";

      // Check if email exists
      const checkQuery = usingPostgres
        ? `SELECT * FROM ${tableName} WHERE email = $1`
        : `SELECT * FROM ${tableName} WHERE email = ?`;
      const existing = await db.query(checkQuery, [email]);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      const insertQuery = usingPostgres
        ? `INSERT INTO ${tableName} (firstname, lastname, email, password) VALUES ($1, $2, $3, $4) RETURNING userid`
        : `INSERT INTO ${tableName} (firstName, lastName, email, password) VALUES (?, ?, ?, ?)`;
      const result = await db.query(insertQuery, [firstName, lastName, email, hashedPassword]);

      // Auto-login
      req.session.user = {
        id: usingPostgres ? result[0].userid : result.insertId,
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
    if (!email || !password) return res.status(400).json({ message: "Missing email or password" });

    try {
      const usingPostgres = process.env.USE_SUPABASE_DB === "true";
      const tableName = usingPostgres ? '"user"' : "user";

      const selectQuery = usingPostgres
        ? `SELECT * FROM ${tableName} WHERE email = $1`
        : `SELECT * FROM ${tableName} WHERE email = ?`;

      const users = await db.query(selectQuery, [email]);
      if (users.length === 0) return res.status(404).json({ message: "User not found" });

      const user = users[0];

      // Login attempts/session lock
      if (!req.session.loginAttempts) req.session.loginAttempts = 0;
      if (!req.session.lockUntil) req.session.lockUntil = null;

      const now = new Date();

      if (req.session.lockUntil && now < req.session.lockUntil) {
        const remainingTime = Math.ceil((req.session.lockUntil - now) / 1000);
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        return res.status(423).json({
          message: `Account locked. Try again in ${minutes}:${seconds.toString().padStart(2, "0")}.`,
          remainingTime,
        });
      }

      if (req.session.lockUntil && now >= req.session.lockUntil) {
        req.session.loginAttempts = 0;
        req.session.lockUntil = null;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        req.session.loginAttempts += 1;
        if (req.session.loginAttempts >= 3) {
          req.session.lockUntil = new Date(now.getTime() + 60000); // lock 1 min
          return res.status(423).json({ message: "Too many failed attempts. Account locked for 1 minute.", remainingTime: 60 });
        }
        return res.status(401).json({ message: `Invalid password. ${3 - req.session.loginAttempts} attempts remaining.` });
      }

      // Successful login
      req.session.loginAttempts = 0;
      req.session.lockUntil = null;

      req.session.user = {
        id: user.userid || user.id,
        firstName: user.firstname || user.firstName,
        lastName: user.lastname || user.lastName,
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

    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 3 * 60000);
      const usingPostgres = process.env.USE_SUPABASE_DB === "true";
      const tableName = usingPostgres ? '"user"' : "user";

      const updateQuery = usingPostgres
        ? `UPDATE ${tableName} SET resetcode=$1, codeexpiry=$2 WHERE email=$3`
        : `UPDATE ${tableName} SET resetCode=?, codeExpiry=? WHERE email=?`;

      const result = await db.query(updateQuery, [code, expiry, email]);
      if ((result.rowCount || result.affectedRows) === 0) return res.status(404).json({ message: "Email not found" });

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
      const usingPostgres = process.env.USE_SUPABASE_DB === "true";
      const tableName = usingPostgres ? '"user"' : "user";
      const selectQuery = usingPostgres
        ? `SELECT resetcode, codeexpiry FROM ${tableName} WHERE email=$1`
        : `SELECT resetCode, codeExpiry FROM ${tableName} WHERE email=?`;

      const users = await db.query(selectQuery, [email]);
      if (users.length === 0) return res.status(404).json({ message: "Email not found" });

      const user = users[0];
      const now = new Date();

      if (user.resetcode !== code && user.resetCode !== code) return res.status(401).json({ message: "Invalid code" });
      if (now > user.codeexpiry && now > user.codeExpiry) return res.status(410).json({ message: "Code expired" });

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
    if (!passwordRegex.test(newPassword)) return res.status(400).json({
      message: "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character"
    });

    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      const usingPostgres = process.env.USE_SUPABASE_DB === "true";
      const tableName = usingPostgres ? '"user"' : "user";

      const updateQuery = usingPostgres
        ? `UPDATE ${tableName} SET password=$1, resetcode=NULL, codeexpiry=NULL WHERE email=$2`
        : `UPDATE ${tableName} SET password=?, resetCode=NULL, codeExpiry=NULL WHERE email=?`;

      const result = await db.query(updateQuery, [hashed, email]);
      if ((result.rowCount || result.affectedRows) === 0) return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Server error during password reset" });
    }
  }
}

module.exports = new AuthController();
