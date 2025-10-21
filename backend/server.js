// server.js
const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 5000; // ✅ Express server port (not 3306)


// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "kgs",
});

// Email transporter (use your own email + app password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "salesforecastingbcf@gmail.com", // replace
    pass: "aaiz ckgx rtqc buck",   // replace with Gmail App Password
  },
  tls: {
    rejectUnauthorized: false,
  },
});


db.connect((error) => {
  if (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL Database");
});

// 🧩 LOGIN ROUTE
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Missing email or password" });

  const query = "SELECT * FROM user WHERE email = ?";
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0)
      return res.status(404).json({ message: "User not found" });

    const user = results[0];

    // ✅ Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid password" });

    res.json({ message: "Login successful", userId: user.userId });
  });
});

// 🧩 FORGOT PASSWORD - SEND CODE
app.post("/forgot", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const expiry = new Date(Date.now() + 30000); // 30seconds validity

  const query = "UPDATE user SET resetCode = ?, codeExpiry = ? WHERE email = ?";
  db.query(query, [code, expiry, email], async (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Email not found" });

    // Send email with OTP
    const mailOptions = {
      from: "salesforecastingbcf@gmail.com",
      to: email,
      subject: "Password Reset Code",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Password Reset</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                .header { background-color: #0A4174; color: white; padding: 20px; text-align: center; }
                .header img { max-width: 150px; height: auto; margin-bottom: 10px; }
                .content { padding: 30px; line-height: 1.6; color: #333333; }
                .code-box { background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; color: #007bff; }
                .footer { background-color: #e9ecef; color: #6c757d; padding: 15px; font-size: 12px; text-align: center; border-top: 1px solid #dee2e6; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Password Reset Request</h2>
                </div>
                <div class="content">
                    <p>Dear Customer,</p>
                    <p>You recently requested a password reset for your account. To proceed, please use the following One-Time Password (OTP) code:</p>
                    
                    <div class="code-box">
                        ${code}
                    </div>

                    <p>This code is only valid for **30 seconds**. For security, please do not share this code with anyone. If you did not request this reset, you can safely ignore this email.</p>
                </div>
                <div class="footer">
                    &copy; ${new Date().getFullYear()} Sales Forecasting. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `,

    };

    // 🧠 Debug log placement — right here
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Email error:", error.response || error); // <— put it here
        return res.status(500).json({ message: "Failed to send email" });
      }
      console.log("✅ OTP sent:", info.response);
      res.json({ message: "OTP sent to your email" });
    });

  });
});


// 🧩 VERIFY CODE
app.post("/verify-code", (req, res) => {
  const { email, code } = req.body;

  if (!email || !code)
    return res.status(400).json({ message: "Missing email or code" });

  const query =
    "SELECT resetCode, codeExpiry FROM user WHERE email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }

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
});


// 🧩 RESET PASSWORD
app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword)
    return res.status(400).json({ message: "Missing data" });

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    const query =
      "UPDATE user SET password = ?, resetCode = NULL, codeExpiry = NULL WHERE email = ?";
    db.query(query, [hashed, email], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Database error" });
      }

      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Email not found" });

      res.json({ message: "Password reset successfully" });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Hashing error" });
  }
});


// Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Database Connected!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
