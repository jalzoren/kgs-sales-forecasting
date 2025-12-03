// routes/forecast.js
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { requireAuth } = require("../middleware/authMiddleware.js");
const PythonService = require("../services/pythonService");
const PDFService = require("../services/pdfService");


router.get("/api/forecast/download/:fileName", requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    console.log("Session user:", user);

    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { fileName } = req.params;
    const safeName = path.basename(fileName);
    const absPath = path.resolve(path.join(__dirname, "../files/forecastData", `user_${user.id}`, safeName));

    console.log("Requested file:", safeName);
    console.log("Resolved path:", absPath);
    console.log("Exists?", fs.existsSync(absPath));

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.download(absPath, safeName);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Helper function to ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

// Helper function to generate PDF if it doesn't exist
async function ensurePDFExists(excelFilePath, userId) {
  try {
    const fileName = path.basename(excelFilePath);
    const baseFileName = fileName.replace(/\.xlsx$/i, "");
    const pdfFileName = `${baseFileName}.pdf`;
    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const pdfPath = path.join(pdfDir, pdfFileName);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found for ${fileName}, generating...`);
      ensureDirectoryExists(pdfDir);
      await PDFService.generateForecastReport(excelFilePath, pdfPath);
      console.log(`✅ Generated PDF: ${pdfFileName}`);
    } else {
      console.log(`✅ PDF already exists: ${pdfFileName}`);
    }
    
    return pdfPath;
  } catch (err) {
    console.error(`⚠️ Failed to generate PDF:`, err.message);
    throw err;
  }
}

// Get forecast history for the logged-in user
router.get("/api/forecast/history", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      console.log("❌ No user ID in session");
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    console.log(`🔍 Fetching forecast history for user ${userId}`);

    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    const absoluteForecastDir = path.resolve(forecastDir);

    console.log(`📂 Checking forecast directory: ${absoluteForecastDir}`);

    // ✅ FIXED: Return 404 status for new users without forecast directory
    if (!fs.existsSync(absoluteForecastDir)) {
      console.log(`📂 No forecast directory found for user ${userId}`);
      return res.status(404).json({ 
        message: "No forecasts found",
        forecasts: [] 
      });
    }

    // Get all Excel files, excluding temp files
    let files;
    try {
      const allFiles = fs.readdirSync(absoluteForecastDir);
      console.log(`📁 All files in directory:`, allFiles);
      
      files = allFiles
        .filter((f) => {
          const isExcel = f.endsWith(".xlsx");
          const isNotTemp = !f.startsWith("~$");
          return isExcel && isNotTemp;
        })
        .map((fileName) => {
          const filePath = path.join(absoluteForecastDir, fileName);
          try {
            const stats = fs.statSync(filePath);
            return { fileName, filePath, mtime: stats.mtime };
          } catch (statErr) {
            console.error(`⚠️ Error getting stats for ${fileName}:`, statErr.message);
            return null;
          }
        })
        .filter(f => f !== null)
        .sort((a, b) => b.mtime - a.mtime); // Sort by newest first
    } catch (readErr) {
      console.error(`❌ Error reading directory:`, readErr.message);
      return res.status(500).json({ 
        message: "Failed to read forecast directory", 
        error: readErr.message 
      });
    }

    console.log(`📁 Found ${files.length} forecast file(s)`);

    const forecasts = [];

    for (const file of files) {
      try {
        const uploadDate = file.mtime;
        
        console.log(`📅 Processing: ${file.fileName}`);
        console.log(`   Modified: ${uploadDate.toISOString()}`);

        // Read Excel file to check available horizons
        if (!fs.existsSync(file.filePath)) {
          console.error(`❌ File does not exist: ${file.filePath}`);
          continue;
        }

        let workbook;
        let sheetNames = [];
        
        try {
          workbook = XLSX.readFile(file.filePath);
          sheetNames = workbook.SheetNames || [];
          console.log(`📋 Sheets in ${file.fileName}:`, sheetNames);
        } catch (xlsxErr) {
          console.error(`❌ Error reading Excel: ${xlsxErr.message}`);
          forecasts.push({
            id: `${file.fileName}_error`,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: [],
            horizon: "Error",
            scope: "All Products",
            status: "Failed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          continue;
        }

        // Check for each horizon
        const horizonConfigs = [
          { days: 7, label: "Next Week", sheetName: "7d_forecast" },
          { days: 30, label: "Next 30 days", sheetName: "30d_forecast" },
          { days: 90, label: "Next 90 days", sheetName: "90d_forecast" },
        ];

        const availableHorizons = [];
        for (const horizon of horizonConfigs) {
          if (sheetNames.includes(horizon.sheetName)) {
            availableHorizons.push({
              days: horizon.days,
              label: horizon.label,
            });
            console.log(`✅ Found: ${horizon.label}`);
          }
        }

        // Auto-generate PDF if needed
        try {
          await ensurePDFExists(file.filePath, userId);
        } catch (pdfErr) {
          console.error(`⚠️ PDF generation failed for ${file.fileName}:`, pdfErr.message);
          // Continue anyway - forecast entry will still be added
        }

        // Create entry with available horizons
        if (availableHorizons.length > 0) {
          forecasts.push({
            id: file.fileName,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: availableHorizons,
            horizon: availableHorizons.map(h => h.label).join(", "),
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
          console.log(`✅ Added: ${file.fileName} (${availableHorizons.length} horizons)`);
        } else if (sheetNames.length > 0) {
          // File exists but no standard sheets
          console.log(`⚠️ No standard sheets in ${file.fileName}`);
          forecasts.push({
            id: file.fileName,
            date: uploadDate.toISOString(),
            dateISO: uploadDate.toISOString(),
            fileName: file.fileName,
            horizons: [],
            horizon: "Available",
            scope: "All Products",
            status: "Completed",
            accuracy: "N/A",
            filePath: `files/forecastData/user_${userId}/${file.fileName}`,
          });
        }
      } catch (err) {
        console.error(`⚠️ Error processing ${file.fileName}:`, err.message);
        forecasts.push({
          id: `${file.fileName}_unknown`,
          date: file.mtime.toISOString(),
          dateISO: file.mtime.toISOString(),
          fileName: file.fileName,
          horizons: [],
          horizon: "Unknown",
          scope: "All Products",
          status: "Failed",
          accuracy: "N/A",
          filePath: `files/forecastData/user_${userId}/${file.fileName}`,
        });
      }
    }

    console.log(`✅ Returning ${forecasts.length} forecast records`);
    res.json(forecasts);
  } catch (err) {
    console.error("❌ Forecast history error:", err);
    console.error("   Stack:", err.stack);
    return res.status(500).json({ 
      message: "Failed to get forecast history", 
      error: err.message 
    });
  }
});

// Generate a new forecast (reforecast)
router.post("/api/forecast", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    console.log(`📈 Generating forecast for user ${userId} (all horizons)`);

    // Generate forecast asynchronously
    PythonService.generateForecast(userId, null)
      .then((resultPath) => {
        if (resultPath) {
          console.log(`✅ Forecast generated: ${resultPath}`);
        } else {
          console.warn(`⚠️ Forecast completed but no file path returned`);
        }
      })
      .catch((err) => {
        console.error(`❌ Forecast generation error:`, err.message);
      });

    // Return immediately (forecast runs in background)
    res.json({
      message: "Forecast generation started for all horizons (Next Week, Next 30 days, Next 90 days). It will appear in your history when complete.",
    });
  } catch (err) {
    console.error("❌ Forecast request error:", err);
    return res.status(500).json({ 
      message: "Failed to start forecast generation", 
      error: err.message 
    });
  }
});



// Get forecast PDF file for viewing
router.get("/api/forecast/view/:fileName", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let { fileName } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    // Decode URL-encoded filename
    fileName = decodeURIComponent(fileName);
    console.log(`🔍 View PDF request: "${fileName}" (user ${userId})`);

    // Sanitize filename
    const sanitizedFileName = path.basename(fileName);
    const baseFileName = sanitizedFileName.replace(/\.(xlsx|pdf)$/i, "");
    const pdfFileName = `${baseFileName}.pdf`;

    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const absolutePdfDir = path.resolve(pdfDir);
    const pdfFilePath = path.join(absolutePdfDir, pdfFileName);
    const absolutePdfPath = path.resolve(pdfFilePath);

    console.log(`📂 PDF directory: ${absolutePdfDir}`);
    console.log(`📄 PDF file: ${absolutePdfPath}`);

    // Security check: ensure file is within user's directory
    if (!absolutePdfPath.startsWith(absolutePdfDir)) {
      console.error(`❌ Security violation: path outside user directory`);
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if directory exists
    if (!fs.existsSync(absolutePdfDir)) {
      console.log(`📁 Creating PDF directory: ${absolutePdfDir}`);
      ensureDirectoryExists(absolutePdfDir);
    }

    // If PDF doesn't exist, generate it from Excel
    if (!fs.existsSync(absolutePdfPath)) {
      console.log(`⚠️ PDF not found, generating from Excel...`);
      
      const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
      const excelFileName = `${baseFileName}.xlsx`;
      const excelFilePath = path.join(forecastDir, excelFileName);
      const absoluteExcelPath = path.resolve(excelFilePath);
      
      if (!fs.existsSync(absoluteExcelPath)) {
        console.error(`❌ Excel file not found: ${absoluteExcelPath}`);
        const allPDFs = fs.existsSync(absolutePdfDir) 
          ? fs.readdirSync(absolutePdfDir).filter(f => f.endsWith(".pdf") && !f.startsWith("~$"))
          : [];
        return res.status(404).json({ 
          message: `Excel file not found: ${excelFileName}`,
          availableFiles: allPDFs
        });
      }

      try {
        console.log(`📄 Generating PDF from: ${absoluteExcelPath}`);
        await PDFService.generateForecastReport(absoluteExcelPath, absolutePdfPath);
        console.log(`✅ PDF generated: ${absolutePdfPath}`);
      } catch (pdfErr) {
        console.error(`❌ PDF generation failed:`, pdfErr.message);
        console.error(`   Stack:`, pdfErr.stack);
        return res.status(500).json({ 
          message: `Failed to generate PDF: ${pdfErr.message}`,
          error: pdfErr.message
        });
      }
    }

    // Verify PDF exists before sending
    if (!fs.existsSync(absolutePdfPath)) {
      console.error(`❌ PDF still doesn't exist after generation attempt`);
      return res.status(500).json({ 
        message: "PDF generation completed but file not found"
      });
    }

    console.log(`✅ Sending PDF: ${absolutePdfPath}`);
    
    // Send PDF file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdfFileName}"`);
    res.sendFile(absolutePdfPath, (err) => {
      if (err) {
        console.error(`❌ Error sending file:`, err);
        if (!res.headersSent) {
          res.status(500).json({ 
            message: "Failed to send PDF file",
            error: err.message
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ Error viewing forecast PDF:", err);
    console.error("   Stack:", err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: "Failed to view forecast PDF", 
        error: err.message 
      });
    }
  }
});

// Generate PDF report from forecast Excel file (download)
router.get("/api/forecast/pdf/:fileName", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let { fileName } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not logged in" });
    }

    // Decode URL-encoded filename
    fileName = decodeURIComponent(fileName);
    console.log(`📄 PDF download request: "${fileName}" (user ${userId})`);

    // Sanitize filename
    const sanitizedFileName = path.basename(fileName);
    if (!sanitizedFileName.endsWith(".xlsx")) {
      return res.status(400).json({ 
        message: "Invalid file format. Only .xlsx files are supported." 
      });
    }

    const forecastDir = path.join(__dirname, "../files/forecastData", `user_${userId}`);
    const absoluteForecastDir = path.resolve(forecastDir);
    const excelFilePath = path.join(absoluteForecastDir, sanitizedFileName);
    const absoluteExcelPath = path.resolve(excelFilePath);

    console.log(`📂 Excel directory: ${absoluteForecastDir}`);
    console.log(`📄 Excel file: ${absoluteExcelPath}`);

    // Security check
    if (!absoluteExcelPath.startsWith(absoluteForecastDir)) {
      console.error(`❌ Security violation: path outside user directory`);
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if Excel file exists
    if (!fs.existsSync(absoluteExcelPath)) {
      console.error(`❌ Excel file not found: ${absoluteExcelPath}`);
      return res.status(404).json({ 
        message: `File not found: ${sanitizedFileName}` 
      });
    }

    // Generate PDF filename
    const pdfFileName = sanitizedFileName.replace(".xlsx", ".pdf");
    const pdfDir = path.join(__dirname, "../files/forecastPdf", `user_${userId}`);
    const pdfFilePath = path.join(pdfDir, pdfFileName);
    const absolutePdfPath = path.resolve(pdfFilePath);

    console.log(`📄 PDF output: ${absolutePdfPath}`);

    // Ensure PDF directory exists
    ensureDirectoryExists(pdfDir);

    // Generate or regenerate PDF
    try {
      console.log(`📄 Generating PDF from: ${absoluteExcelPath}`);
      await PDFService.generateForecastReport(absoluteExcelPath, absolutePdfPath);
      console.log(`✅ PDF generated: ${absolutePdfPath}`);
    } catch (pdfErr) {
      console.error(`❌ PDF generation failed:`, pdfErr.message);
      console.error(`   Stack:`, pdfErr.stack);
      return res.status(500).json({ 
        message: "Failed to generate PDF",
        error: pdfErr.message
      });
    }

    // Verify PDF exists
    if (!fs.existsSync(absolutePdfPath)) {
      console.error(`❌ PDF not found after generation`);
      return res.status(500).json({ 
        message: "PDF generation completed but file not found"
      });
    }

    console.log(`✅ Sending PDF for download: ${absolutePdfPath}`);

    // Send PDF file for download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFileName}"`);
    res.sendFile(absolutePdfPath, (err) => {
      if (err) {
        console.error(`❌ Error sending file:`, err);
        if (!res.headersSent) {
          res.status(500).json({ 
            message: "Failed to send PDF file",
            error: err.message
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    console.error("   Stack:", err.stack);
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: "Failed to generate PDF", 
        error: err.message 
      });
    }
  }
});

// Get forecast files for a user (legacy endpoint)
router.get("/files/:userId", (req, res) => {
  const { userId } = req.params;

  const dirPath = path.join(__dirname, "../files/forecastData", `user_${userId}`);

  if (!fs.existsSync(dirPath)) {
    return res.json([]);
  }

  try {
    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
      .map((filename) => {
        try {
          const filePath = path.join(dirPath, filename);
          return {
            filename,
            url: `/files/forecastData/user_${userId}/${filename}`,
            date: fs.statSync(filePath).mtime,
          };
        } catch (err) {
          console.error(`⚠️ Error reading file ${filename}:`, err.message);
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(files);
  } catch (err) {
    console.error("❌ Error reading forecast files:", err);
    res.status(500).json({ 
      message: "Failed to read forecast files",
      error: err.message
    });
  }
});

module.exports = router;