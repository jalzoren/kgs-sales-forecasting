// services/fileService.js
const fs = require("fs");
const path = require("path");
const multer = require("multer");

class FileService {
  constructor() {
    this.uploadDir = path.join(__dirname, "../files/salesData");
    this.ensureUploadDir();
    this.upload = this.configureMulter();
  }

  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      console.log("📁 Created upload directory:", this.uploadDir);
    } else {
      console.log("✅ Upload directory exists:", this.uploadDir);
    }
  }

  configureMulter() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, this.uploadDir),
      filename: (req, file, cb) => cb(null, file.originalname),
    });
    return multer({ storage });
  }
}

module.exports = new FileService();
