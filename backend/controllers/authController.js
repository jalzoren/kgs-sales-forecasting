// controllers/authController.js
const bcrypt = require("bcrypt");
const db = require("../config/db"); // Supabase wrapper
const mailService = require("../services/mailService");

class AuthController {
  // REGISTER
  async register(req, res) {
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/;

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
      const existing = await db.query("user", {
        params: { select: "*", email },
      });

      if (existing.length > 0) {
        return res.status(409).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      const newUser = await db.query("user", {
        method: "POST",
        data: {
          firstname: firstName,
          lastname: lastName,
          email,
          password: hashedPassword,
          createdat: new Date().toISOString(),
        },
      });

      // Auto-login
      req.session.user = {
        id: newUser[0]?.userid || null,
        email,
        firstName,
        lastName,
      };

      res.status(201).json({
        message: "Account created successfully!",
        user: req.session.user,
      });
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

    try {
      const users = await db.query("user", { params: { select: "*", email } });

      if (!users || users.length === 0)
        return res.status(404).json({ message: "User not found" });

      const user = users[0];

      // Initialize session login attempts
      if (!req.session.loginAttempts) req.session.loginAttempts = 0;
      if (!req.session.lockUntil) req.session.lockUntil = null;

      const now = new Date();

      if (req.session.lockUntil && now < req.session.lockUntil) {
        const remaining = Math.ceil((req.session.lockUntil - now) / 1000);
        return res.status(423).json({ message: `Account locked. Try again in ${remaining} seconds.`, remainingTime: remaining });
      }

      if (req.session.lockUntil && now >= req.session.lockUntil) {
        req.session.loginAttempts = 0;
        req.session.lockUntil = null;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        req.session.loginAttempts += 1;
        if (req.session.loginAttempts >= 3) {
          req.session.lockUntil = new Date(now.getTime() + 60000); // 1 min lock
          return res.status(423).json({ message: "Too many failed attempts. Account locked for 1 minute.", remainingTime: 60 });
        }
        return res.status(401).json({ message: `Invalid password. ${3 - req.session.loginAttempts} attempts remaining.` });
      }

      req.session.loginAttempts = 0;
      req.session.lockUntil = null;

      req.session.user = {
        id: user.userid,
        email: user.email,
        firstName: user.firstname,
        lastName: user.lastname,
      };

      res.json({ message: "Login successful", user: req.session.user });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error during login" });
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

  // FORGOT PASSWORD
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 3 * 60000).toISOString();

    try {
      const updated = await db.query("user", {
        method: "PATCH",
        data: { resetcode: code, codeexpiry: expiry },
        params: { email },
      });

      if (!updated || updated.length === 0)
        return res.status(404).json({ message: "Email not found" });

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent)
        return res.status(500).json({ message: "Failed to send email" });

      res.json({ message: "OTP sent to your email" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // VERIFY CODE
  async verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Missing email or code" });

    try {
      const users = await db.query("user", { params: { select: "*", email } });
      if (!users || users.length === 0) return res.status(404).json({ message: "Email not found" });

      const user = users[0];
      const now = new Date();

      if (user.resetcode !== code) return res.status(401).json({ message: "Invalid code" });
      if (now > new Date(user.codeexpiry)) return res.status(410).json({ message: "Code expired" });

      res.json({ message: "Code verified successfully" });
    } catch (error) {
      console.error("Verify code error:", error);
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
      const updated = await db.query("user", {
        method: "PATCH",
        data: { password: hashed, resetcode: null, codeexpiry: null },
        params: { email },
      });

      if (!updated || updated.length === 0) return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new AuthController();
