const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

class AuthController {
  // Helper function to check if using Supabase/Postgres
  isSupabase() {
    return !!process.env.SUPABASE_DB_URL || process.env.USE_SUPABASE_DB === "true";
  }

  // REGISTER
  async register(req, res) {
    console.log("📥 Register request received:", req.body);
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
      let existingUsers;
      if (this.isSupabase()) {
        // Supabase
        existingUsers = await db.query(
          "SELECT * FROM \"user\" WHERE email = $1",
          [email]
        );
      } else {
        // MySQL
        existingUsers = await db.query("SELECT * FROM user WHERE email = ?", [
          email,
        ]);
      }

      if (existingUsers.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      let newUser;
      if (this.isSupabase()) {
        const result = await db.query(
          `INSERT INTO "user" (firstname, lastname, email, password) VALUES ($1,$2,$3,$4) RETURNING *`,
          [firstName, lastName, email, hashedPassword]
        );
        newUser = result;
      } else {
        const result = await db.query(
          "INSERT INTO user (firstname, lastname, email, password) VALUES (?,?,?,?)",
          [firstName, lastName, email, hashedPassword]
        );
        // Fetch the inserted user
        const insertedId = result.insertId;
        const [rows] = await db.query("SELECT * FROM user WHERE userid = ?", [
          insertedId,
        ]);
        newUser = rows;
      }

      // Auto-login after registration
      req.session.user = {
        id: newUser[0].userid,
        email: newUser[0].email,
        firstName: newUser[0].firstname,
        lastName: newUser[0].lastname,
      };

      res.json({
        message: "Account created successfully!",
        user: req.session.user,
      });
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({ message: "Server error during registration", error: error.message });
    }
  }

  // LOGIN
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    try {
      let users;
      if (this.isSupabase()) {
        users = await db.query('SELECT * FROM "user" WHERE email = $1', [email]);
      } else {
        users = await db.query("SELECT * FROM user WHERE email = ?", [email]);
      }

      if (!users || users.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = users[0];

      // Session lock/attempts logic
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
          req.session.lockUntil = new Date(now.getTime() + 60000);
          return res.status(423).json({
            message: "Too many failed attempts. Account locked for 1 minute.",
            remainingTime: 60,
          });
        }
        return res.status(401).json({ message: `Invalid password. ${3 - req.session.loginAttempts} attempts remaining.` });
      }

      // Successful login
      req.session.loginAttempts = 0;
      req.session.lockUntil = null;
      req.session.user = {
        id: user.userid,
        email: user.email,
        firstName: user.firstname,
        lastName: user.lastname,
      };

      res.json({ message: "Login successful", user: req.session.user });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  checkSession(req, res) {
    if (req.session.user) {
      res.json({ loggedIn: true, user: req.session.user });
    } else {
      res.json({ loggedIn: false });
    }
  }

  async logout(req, res) {
    try {
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    } catch (err) {
      res.status(500).json({ message: "Server error during logout" });
    }
  }

  // FORGOT PASSWORD
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 3 * 60000);

    try {
      let result;
      if (this.isSupabase()) {
        result = await db.query(
          'UPDATE "user" SET resetcode=$1, codeexpiry=$2 WHERE email=$3 RETURNING *',
          [code, expiry.toISOString(), email]
        );
      } else {
        result = await db.query(
          "UPDATE user SET resetcode=?, codeexpiry=? WHERE email=?",
          [code, expiry, email]
        );
      }

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Email not found" });
      }

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent) return res.status(500).json({ message: "Failed to send email" });

      res.json({ message: "OTP sent to your email" });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Database error" });
    }
  }

  // VERIFY CODE
  async verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Missing email or code" });

    try {
      let users;
      if (this.isSupabase()) {
        users = await db.query('SELECT resetcode, codeexpiry FROM "user" WHERE email=$1', [email]);
      } else {
        users = await db.query("SELECT resetcode, codeexpiry FROM user WHERE email=?", [email]);
      }

      if (!users || users.length === 0) return res.status(404).json({ message: "Email not found" });

      const user = users[0];
      const now = new Date();

      if (user.resetcode !== code) return res.status(401).json({ message: "Invalid code" });
      if (now > new Date(user.codeexpiry)) return res.status(410).json({ message: "Code expired" });

      res.json({ message: "Code verified successfully" });
    } catch (err) {
      console.error("Verify code error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // RESET PASSWORD
  async resetPassword(req, res) {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: "Missing data" });

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
      let result;
      if (this.isSupabase()) {
        result = await db.query('UPDATE "user" SET password=$1, resetcode=NULL, codeexpiry=NULL WHERE email=$2 RETURNING *', [hashed, email]);
      } else {
        result = await db.query("UPDATE user SET password=?, resetcode=NULL, codeexpiry=NULL WHERE email=?", [hashed, email]);
      }

      if (!result || result.length === 0) return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Hashing error" });
    }
  }
}

module.exports = new AuthController();
