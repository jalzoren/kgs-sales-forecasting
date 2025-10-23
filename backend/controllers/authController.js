// controllers/authController.js
// login, forgot, verify, and reset password logic
const bcrypt = require("bcrypt");
const db = require("../config/db");
const mailService = require("../services/mailService");

class AuthController {
  // LOGIN
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    db.query("SELECT * FROM user WHERE email = ?", [email], async (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (results.length === 0)
        return res.status(404).json({ message: "User not found" });

      const user = results[0];
      const now = new Date();

      // Check if account is locked
      if (user.locked_until && now < user.locked_until) {
      const remainingTime = Math.ceil((user.lockedUntil - now) / 1000);
      const minutes = Math.floor(remainingTime / 60);
      const seconds = remainingTime % 60;
      
      return res.status(423).json({ 
        message: `Account locked. Try again in ${minutes}:${seconds.toString().padStart(2, '0')}.`,
        lockedUntil: user.lockedUntil,
        remainingTime: remainingTime
      });
    }

      // Reset lock if time has passed
      if (user.locked_until && now >= user.locked_until) {
        db.query("UPDATE user SET loginAttempts = 0, lockedUntil = NULL WHERE userId = ?", [user.userId]);
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch){
        // Increment login attempts
        const newAttempts = user.loginAttempts + 1;
        let lockedUntil = null;
        
        // Lock account after 5 failed attempts for 1 minute
        if (newAttempts >= 3) {
          lockedUntil = new Date(now.getTime() + 60000); // 1 minute
        }

        db.query(
          "UPDATE user SET loginAttempts = ?, lockedUntil = ? WHERE userId = ?", 
          [newAttempts, lockedUntil, user.userId]
        );

        let message = `Invalid password. ${3 - newAttempts} attempts remaining.`;
        if (lockedUntil) {
          message = "Too many failed attempts. Account locked for 1 minute.";
        }

        return res.status(401).json({ 
          message,
          lockedUntil: lockedUntil,
          remainingTime: 60
        });
      }

      // Successful login - reset attempts and update last login
      db.query(
        "UPDATE user SET loginAttempts = 0, lockedUntil = NULL, lastLogin = NOW() WHERE userId = ?", 
        [user.userId]
      );

      // Store user info in session
      req.session.user = {
        id: user.userId,
        email: user.email,
        role: user.role
      };

      res.json({ message: "Login successful", user: req.session.user });
    });
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
    if (!email)
      return res.status(400).json({ message: "Email required" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30000); // 30s validity

    db.query("UPDATE user SET resetCode = ?, codeExpiry = ? WHERE email = ?", [code, expiry, email], async (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Email not found" });

      const emailSent = await mailService.sendResetCode(email, code);
      if (!emailSent) return res.status(500).json({ message: "Failed to send email" });

      res.json({ message: "OTP sent to your email" });
    });
  }

  // VERIFY CODE
  verifyCode(req, res) {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ message: "Missing email or code" });

    db.query("SELECT resetCode, codeExpiry FROM user WHERE email = ?", [email], (err, results) => {
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
    });
  }

  // RESET PASSWORD
  async resetPassword(req, res) {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
      return res.status(400).json({ message: "Missing data" });

    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      db.query(
        "UPDATE user SET password = ?, resetCode = NULL, codeExpiry = NULL, loginAttemps = 0, lockedUntil = NULL WHERE email = ?",
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
