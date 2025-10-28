const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../config/db.js");
const { requireAuth } = require("../middleware/authMiddleware.js");
const csv = require("csv-parser"); // ✅ ADD THIS LINE

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

// ✅ UPDATED: Upload csv + COUNT RECORDS
router.post("/api/data/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.file;
  const filePath = file.path;
  const fileName = file.originalname;

  console.log(`📁 Starting upload for: ${fileName}`);

  // Step 1: Insert initial record
  const insertSql = "INSERT INTO salesdata (fileName, records, status) VALUES (?, ?, ?)";
  db.query(insertSql, [fileName, 0, "Processing"], (err, result) => {
    if (err) {
      console.error("❌ Database insert error:", err);
      return res.status(500).json({ message: "Upload failed", error: err });
    }

    const uploadId = result.insertId;
    let rowCount = 0;

    console.log("🔍 Starting CSV record counting...");

    // Step 2: Read CSV and count rows
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        // Show progress every 1000 rows
        if (rowCount % 1000 === 0) {
          console.log(`📊 Processed ${rowCount} rows...`);
        }
      })
      .on('end', () => {
        console.log(`✅ CSV counting complete: ${rowCount} total rows`);
        
        // Step 3: Update database with actual count
        const updateSql = "UPDATE salesdata SET records = ?, status = ? WHERE salesID = ?";
        db.query(updateSql, [rowCount, "Completed", uploadId], (updateErr) => {
          if (updateErr) {
            console.error("❌ Database update error:", updateErr);
            return res.status(500).json({ message: "Error updating record count", error: updateErr });
          }
          
          console.log(`🎉 Success! File: ${fileName}, Records: ${rowCount}`);
          res.json({ 
            message: `File uploaded successfully (${rowCount.toLocaleString()} records)`, 
            id: uploadId,
            records: rowCount 
          });
        });
      })
      .on('error', (readErr) => {
        console.error("❌ CSV read error:", readErr);
        // Mark as failed in database
        const failSql = "UPDATE salesdata SET status = ? WHERE salesID = ?";
        db.query(failSql, ["Failed", uploadId]);
        res.status(500).json({ message: "Failed to process CSV file", error: readErr });
      });
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