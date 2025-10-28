const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../config/db.js");
const { requireAuth } = require("../middleware/authMiddleware.js");

const router = express.Router();

// ensure uploads folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// fetch
router.get("/api/data", requireAuth, (req, res) => {
  const sql = "SELECT * FROM salesdata ORDER BY uploadDate DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    res.json(results);
  });
});

// Upload csv
router.post("/api/data/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const { originalname } = req.file;
  const sql = "INSERT INTO salesdata (fileName, records, status) VALUES (?, ?, ?)";
  db.query(sql, [originalname, 0, "Processing"], (err, result) => {
    if (err) return res.status(500).json({ message: "Upload failed", error: err });
    res.json({ message: "File uploaded successfully", id: result.insertId });
  });
});

// Delete
router.delete("/api/data/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM salesdata WHERE salesID = ?";
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ message: "Deletion failed", error: err });
    res.json({ message: "Upload deleted successfully" });
  });
});

module.exports = router;
