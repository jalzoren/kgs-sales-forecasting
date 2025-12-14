const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware.js");
const FileService = require("../services/fileService");
const DataController = require("../controllers/dataController");

// List of uploads (also used for polling)
router.get("/", requireAuth, (req, res) => DataController.getUploads(req, res));

// User data status (for dashboard/welcome page)
router.get("/status", requireAuth, (req, res) => DataController.getUserDataStatus(req, res));

// Preprocessing status polling
router.get("/preprocess-status", requireAuth, (req, res) => DataController.getPreprocessStatus(req, res));

// Training status polling
router.get("/training-status", requireAuth, (req, res) => DataController.getTrainingStatus(req, res));

// Upload endpoint
router.post(
  "/upload",
  requireAuth,
  FileService.upload.single("file"),
  (req, res) => DataController.handleUpload(req, res)
);

// Delete uploaded file
router.delete("/:id", requireAuth, (req, res) => DataController.deleteUpload(req, res));

module.exports = router;
