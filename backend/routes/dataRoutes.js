// routes/dataRoutes.js
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware.js");
const FileService = require("../services/fileService");
const DataController = require("../controllers/dataController");

router.get("/api/data", requireAuth, (req, res) =>
  DataController.getUploads(req, res)
);

router.post(
  "/api/data/upload",
  requireAuth,
  FileService.upload.single("file"),
  (req, res) => DataController.handleUpload(req, res)
);

router.delete("/api/data/:id", requireAuth, (req, res) =>
  DataController.deleteUpload(req, res)
);

module.exports = router;
