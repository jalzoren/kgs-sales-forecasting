const express = require('express');
const router = express.Router();

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

// Models (adjust based on your database schema)
// Assuming you're using MongoDB/Mongoose
const DownloadLog = require('../models/DownloadLog');
const DeletionLog = require('../models/DeletionLog');

// ======================================================
// GET /api/reports/downloads - Fetch all download logs
// ======================================================
router.get('/downloads', isAuthenticated, async (req, res) => {
  try {
    const logs = await DownloadLog.find()
      .sort({ timestamp: -1 })
      .limit(1000); // Limit to last 1000 records
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching download logs:', error);
    res.status(500).json({ message: 'Failed to fetch download logs' });
  }
});

// ======================================================
// GET /api/reports/deletions - Fetch all deletion logs
// ======================================================
router.get('/deletions', isAuthenticated, async (req, res) => {
  try {
    const logs = await DeletionLog.find()
      .sort({ timestamp: -1 })
      .limit(1000); // Limit to last 1000 records
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching deletion logs:', error);
    res.status(500).json({ message: 'Failed to fetch deletion logs' });
  }
});

// ======================================================
// POST /api/reports/log-download - Log a download event
// ======================================================
router.post('/log-download', isAuthenticated, async (req, res) => {
  try {
    const { fileName, fileType, status } = req.body;
    const user = req.session.user.username || req.session.user.email || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress;

    const downloadLog = new DownloadLog({
      fileName,
      fileType,
      status: status || 'Completed',
      user,
      username: user,
      ip,
      timestamp: new Date(),
    });

    await downloadLog.save();
    
    console.log(`📥 Download logged: ${fileName} by ${user}`);
    res.json({ success: true, message: 'Download logged successfully' });
  } catch (error) {
    console.error('Error logging download:', error);
    res.status(500).json({ message: 'Failed to log download' });
  }
});

// ======================================================
// POST /api/reports/log-deletion - Log a deletion event
// ======================================================
router.post('/log-deletion', isAuthenticated, async (req, res) => {
  try {
    const { fileName, fileType, reason } = req.body;
    const user = req.session.user.username || req.session.user.email || 'Unknown';

    const deletionLog = new DeletionLog({
      fileName,
      fileType: fileType || 'Forecast',
      reason: reason || 'Manual deletion',
      user,
      username: user,
      timestamp: new Date(),
    });

    await deletionLog.save();
    
    console.log(`🗑️ Deletion logged: ${fileName} by ${user}`);
    res.json({ success: true, message: 'Deletion logged successfully' });
  } catch (error) {
    console.error('Error logging deletion:', error);
    res.status(500).json({ message: 'Failed to log deletion' });
  }
});