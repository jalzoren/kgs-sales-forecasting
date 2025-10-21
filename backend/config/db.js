// config/db.js, this is the database connection module
const mysql = require("mysql");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "kgs",
});

db.connect((error) => {
  if (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL Database");
});

module.exports = db;
