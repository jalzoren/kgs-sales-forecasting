// controllers/authController.js
// Hybrid MySQL/PostgreSQL authentication controller
const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

// Helper: Detect if using PostgreSQL or MySQL
const isPostgres = process.env.USE_SUPABASE_DB === 'true' || !!process.env.SUPABASE_DB_URL;

class AuthController {
  // REGISTER
  async register(req, res) {
    console.log("📥 Register request received:", req.body);
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;

    // Validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      console.log("❌ Missing fields");
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
      // Check if email already exists
      console.log("🔍 Checking if email exists:", email);
      
      const checkEmailSql = isPostgres 
        ? `SELECT userid FROM "user" WHERE email = $1`
        : `SELECT userid FROM user WHERE email = ?`;
      
      const existingUsers = await new Promise((resolve, reject) => {
        db.query(checkEmailSql, [email], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      console.log("📊 Existing users found:", existingUsers);

      if (existingUsers && existingUsers.length > 0) {
        console.log("⚠️ Email already registered");
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      console.log("🔐 Hashing password...");
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      console.log("💾 Inserting new user into database...");
      
      let newUser;
      if (isPostgres) {
        const insertUserSql = `
          INSERT INTO "user" (firstname, lastname, email, password) 
          VALUES ($1, $2, $3, $4) 
          RETURNING userid, email, firstname, lastname
        `;
        newUser = await new Promise((resolve, reject) => {
          db.query(insertUserSql, [firstName, lastName, email, hashedPassword], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
      } else {
        // MySQL
        const insertUserSql = `
          INSERT INTO user (firstname, lastname, email, password) 
          VALUES (?, ?, ?, ?)
        `;
        const result = await new Promise((resolve, reject) => {
          db.query(insertUserSql, [firstName, lastName, email, hashedPassword], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
        
        // Fetch the inserted user
        const selectSql = `SELECT userid, email, firstname, lastname FROM user WHERE userid = ?`;
        newUser = await new Promise((resolve, reject) => {
          db.query(selectSql, [result.insertId], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
      }

      console.log("✅ User created:", newUser);

      if (!newUser || newUser.length === 0) {
        console.error("❌ Registration error: No user returned");
        return res.status(500).json({ message: "Failed to create account" });
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
      console.error("Error details:", error.message);
      res.status(500).json({ 
        message: "Server error during registration",
        error: error.message 
      });
    }
  }

  // LOGIN
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    try {
      // Get user by email
      const getUserSql = isPostgres
        ? `SELECT userid, email, firstname, lastname, password FROM "user" WHERE email = $1`
        : `SELECT userid, email, firstname, lastname, password FROM user WHERE email = ?`;
      
      const results = await new Promise((resolve, reject) => {
        db.query(getUserSql, [email], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!results || results.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

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
        id: user.userid,
        email: user.email,
        firstName: user.firstname,
        lastName: user.lastname,
      };

      res.json({ message: "Login successful", user: req.session.user });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
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
  async logout(req, res) {
    try {
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Server error during logout" });
    }
  }

  // SEND RESET CODE
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 3 * 60000);

    try {
      // Update user with reset code
      let result;
      if (isPostgres) {
        const updateSql = `
          UPDATE "user" 
          SET resetcode = $1, codeexpiry = $2 
          WHERE email = $3 
          RETURNING userid
        `;
        result = await new Promise((resolve, reject) => {
          db.query(updateSql, [code, expiry.toISOString(), email], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
      } else {
        const updateSql = `
          UPDATE user 
          SET resetcode = ?, codeexpiry = ? 
          WHERE email = ?
        `;
        result = await new Promise((resolve, reject) => {
          db.query(updateSql, [code, expiry.toISOString(), email], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
        // MySQL doesn't return rows, check affectedRows
        if (result.affectedRows === 0) {
          result = [];
        } else {
          result = [{ userid: 1 }]; // Dummy to pass length check
        }
      }

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Email not found" });
      }

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send email" });
      }

      res.json({ message: "OTP sent to your email" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Database error" });
    }
  }

  // VERIFY CODE
  async verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ message: "Missing email or code" });

    try {
      // Get reset code and expiry
      const getUserSql = isPostgres
        ? `SELECT resetcode, codeexpiry FROM "user" WHERE email = $1`
        : `SELECT resetcode, codeexpiry FROM user WHERE email = ?`;
      
      const results = await new Promise((resolve, reject) => {
        db.query(getUserSql, [email], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!results || results.length === 0) {
        return res.status(404).json({ message: "Email not found" });
      }

      const user = results[0];
      const now = new Date();

      if (user.resetcode !== code) {
        return res.status(401).json({ message: "Invalid code" });
      }

      if (now > new Date(user.codeexpiry)) {
        return res.status(410).json({ message: "Code expired" });
      }

      res.json({ message: "Code verified successfully" });
    } catch (error) {
      console.error("Verify code error:", error);
      res.status(500).json({ message: "Server error" });
    }
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

      // Update password and clear reset fields
      let result;
      if (isPostgres) {
        const updateSql = `
          UPDATE "user" 
          SET password = $1, resetcode = NULL, codeexpiry = NULL 
          WHERE email = $2 
          RETURNING userid
        `;
        result = await new Promise((resolve, reject) => {
          db.query(updateSql, [hashed, email], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
      } else {
        const updateSql = `
          UPDATE user 
          SET password = ?, resetcode = NULL, codeexpiry = NULL 
          WHERE email = ?
        `;
        result = await new Promise((resolve, reject) => {
          db.query(updateSql, [hashed, email], (err, results) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
        // MySQL check
        if (result.affectedRows === 0) {
          result = [];
        } else {
          result = [{ userid: 1 }];
        }
      }

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Email not found" });
      }

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Hashing error" });
    }
  }
}

module.exports = new AuthController();