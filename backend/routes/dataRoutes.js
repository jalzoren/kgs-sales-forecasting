// routes/dataRoutes.js
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware.js");
const FileService = require("../services/fileService");
const DataController = require("../controllers/dataController");

router.get("/data", requireAuth, (req, res) =>
  DataController.getUploads(req, res)
);

// Check user's overall data status (for Welcome page)
router.get("/data/status", requireAuth, (req, res) =>
  DataController.getUserDataStatus(req, res)
);

// Preprocess status polling
router.get("/data/preprocess-status", requireAuth, (req, res) =>
  DataController.getPreprocessStatus(req, res)
);

// Training status polling
router.get("/data/training-status", requireAuth, (req, res) =>
  DataController.getTrainingStatus(req, res)
);

router.post(
  "/data/upload",
  requireAuth,
  FileService.upload.single("file"),
  (req, res) => DataController.handleUpload(req, res)
);

router.delete("/data/:id", requireAuth, (req, res) =>
  DataController.deleteUpload(req, res)
);

module.exports = router;
