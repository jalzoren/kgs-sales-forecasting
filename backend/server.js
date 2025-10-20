// server.js
const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const bcrypt = require("bcrypt");

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

/*db.connect((error) => {
  if (error) {
    console.error("❌ Error connecting to the database:", error);
    return;
  }
  console.log("✅ Connected to MySQL Database");
});*/

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

// Default route
app.get("/", (req, res) => {
  res.send("Sales Forecasting System - Database Connected!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
