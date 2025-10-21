// backend/routes/dataRoutes.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../config/db.js");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 📂 Create uploads folder if not exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ⚙️ Multer setup for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// ✅ GET all uploads
app.get("/api/data", (req, res) => {
  const sql = "SELECT * FROM salesdata ORDER BY uploadDate DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// 📤 POST upload new file
app.post("/api/data/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "No file uploaded" });

  const fileName = file.originalname;
  const records = 0; // placeholder, later count rows if needed
  const status = "Processing";

  const sql = "INSERT INTO salesdata (fileName, records, status) VALUES (?, ?, ?)";
  db.query(sql, [fileName, records, status], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "File uploaded successfully", id: result.insertId });
  });
});

// ❌ DELETE upload record
app.delete("/api/data/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM salesdata WHERE salesID = ?";
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "Upload deleted successfully" });
  });
});

// 🚀 Start server
app.listen(PORT, () => console.log(`✅ Data backend running at http://localhost:${PORT}`));
