// services/pdfService.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Define fonts for pdfmake with better error handling
let fonts;
try {
  const fontsPath = path.join(__dirname, "../../node_modules/pdfmake/build/vfs_fonts.js");
  
  // Check if vfs_fonts exists (newer pdfmake versions)
  if (fs.existsSync(fontsPath)) {
    const vfsFonts = require("pdfmake/build/vfs_fonts");
    fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
      }
    };
  } else {
    throw new Error("VFS fonts not found");
  }
} catch (err) {
  console.warn("⚠️ Using default fonts");
  fonts = {
    Roboto: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  };
}

class PDFService {
  /**
   * Generate a 4-page PDF report from forecast Excel file
   * @param {string} excelFilePath - Path to the Excel forecast file
   * @param {string} outputPath - Path where PDF should be saved
   * @returns {Promise<string>} Path to generated PDF
   */
  async generateForecastReport(excelFilePath, outputPath) {
    try {
      console.log(`📄 Starting PDF generation...`);
      console.log(`   Excel file: ${excelFilePath}`);
      console.log(`   Output path: ${outputPath}`);

      // Validate Excel file exists
      if (!fs.existsSync(excelFilePath)) {
        throw new Error(`Excel file not found: ${excelFilePath}`);
      }
      console.log(`✓ Excel file exists`);

      // Check file permissions
      try {
        fs.accessSync(excelFilePath, fs.constants.R_OK);
        console.log(`✓ Excel file is readable`);
      } catch (err) {
        throw new Error(`Cannot read Excel file (permission denied): ${excelFilePath}`);
      }

      // Read Excel file
      console.log(`📖 Reading Excel file...`);
      let workbook;
      try {
        workbook = XLSX.readFile(excelFilePath);
        console.log(`✓ Excel file read successfully`);
      } catch (err) {
        throw new Error(`Failed to read Excel file: ${err.message}`);
      }

      const sheetNames = workbook.SheetNames || [];
      console.log(`   Found ${sheetNames.length} sheets: ${sheetNames.join(", ")}`);

      if (sheetNames.length === 0) {
        throw new Error("Excel file contains no sheets");
      }

      // Extract data from each sheet
      const sheetsData = {};
      sheetNames.forEach((sheetName) => {
        try {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          sheetsData[sheetName] = jsonData;
          console.log(`   ✓ Sheet "${sheetName}": ${jsonData.length} rows`);
        } catch (err) {
          console.error(`   ✗ Failed to read sheet "${sheetName}": ${err.message}`);
          sheetsData[sheetName] = [];
        }
      });

      // Get file info
      const fileName = path.basename(excelFilePath);
      const fileStats = fs.statSync(excelFilePath);
      const generatedDate = fileStats.mtime;

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      console.log(`📁 Checking output directory: ${outputDir}`);
      
      if (!fs.existsSync(outputDir)) {
        console.log(`   Creating output directory...`);
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`   ✓ Directory created`);
      } else {
        console.log(`   ✓ Directory exists`);
      }

      // Check write permissions for output directory
      try {
        fs.accessSync(outputDir, fs.constants.W_OK);
        console.log(`✓ Output directory is writable`);
      } catch (err) {
        throw new Error(`Cannot write to output directory (permission denied): ${outputDir}`);
      }

      // Build PDF document
      console.log(`🔨 Building PDF document...`);
      const docDefinition = this.buildPDFDocument(fileName, generatedDate, sheetsData);
      console.log(`✓ Document definition created`);

      // Generate PDF using pdfmake
      console.log(`📝 Creating PDF...`);
      const printer = new PdfPrinter(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Write PDF to file
      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputPath);
        
        writeStream.on("open", () => {
          console.log(`✓ Write stream opened`);
        });

        pdfDoc.pipe(writeStream);

        pdfDoc.on("end", () => {
          console.log(`✅ PDF generation completed successfully`);
          console.log(`   Output: ${outputPath}`);
          
          // Verify file was created
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
            resolve(outputPath);
          } else {
            reject(new Error("PDF file was not created"));
          }
        });

        pdfDoc.on("error", (err) => {
          console.error("❌ PDF document error:", err);
          reject(new Error(`PDF generation error: ${err.message}`));
        });

        writeStream.on("error", (err) => {
          console.error("❌ Write stream error:", err);
          reject(new Error(`File write error: ${err.message}`));
        });

        writeStream.on("finish", () => {
          console.log(`✓ Write stream finished`);
        });

        pdfDoc.end();
      });
    } catch (err) {
      console.error("❌ Error generating PDF report:");
      console.error(`   Message: ${err.message}`);
      console.error(`   Stack: ${err.stack}`);
      throw err;
    }
  }

  /**
   * Build PDF document definition with 4 pages
   */
  buildPDFDocument(fileName, generatedDate, sheetsData) {
    const sevenDayData = sheetsData["7d_forecast"] || [];
    const thirtyDayData = sheetsData["30d_forecast"] || [];
    const ninetyDayData = sheetsData["90d_forecast"] || [];
    const inventoryAlerts = sheetsData["inventory_alerts"] || [];

    // Helper to format date
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    // Helper to create table from data
    const createTable = (data, maxRows = 20) => {
      if (!data || data.length === 0) {
        return {
          text: "No data available",
          style: "noData",
        };
      }

      const headers = Object.keys(data[0]);
      const rows = data.slice(0, maxRows).map((row) =>
        headers.map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          if (typeof value === "number") {
            return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
          }
          return String(value);
        })
      );

      return {
        table: {
          headerRows: 1,
          widths: headers.map(() => "*"),
          body: [
            headers.map((h) => ({ text: h, style: "tableHeader" })),
            ...rows.map((row) => row.map((cell) => ({ text: cell || "", style: "tableCell" }))),
          ],
        },
        layout: {
          hLineWidth: (i) => (i === 0 || i === 1 ? 2 : 1),
          vLineWidth: () => 1,
          hLineColor: () => "#0a4174",
          vLineColor: () => "#0a4174",
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      };
    };

    // Helper to calculate summary stats
    const calculateSummary = (data, forecastColumn = "Forecasted_Sales") => {
      if (!data || data.length === 0) {
        return { total: 0, avg: 0, min: 0, max: 0, count: 0 };
      }

      const values = data
        .map((row) => parseFloat(row[forecastColumn]) || 0)
        .filter((v) => !isNaN(v));

      if (values.length === 0) {
        return { total: 0, avg: 0, min: 0, max: 0, count: 0 };
      }

      return {
        total: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
    };

    const summary7d = calculateSummary(sevenDayData);
    const summary30d = calculateSummary(thirtyDayData);
    const summary90d = calculateSummary(ninetyDayData);

    return {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      defaultStyle: {
        font: "Roboto",
        fontSize: 10,
      },
      styles: {
        header: {
          fontSize: 24,
          bold: true,
          color: "#0a4174",
          margin: [0, 0, 0, 20],
        },
        subheader: {
          fontSize: 16,
          bold: true,
          color: "#0a4174",
          margin: [0, 10, 0, 10],
        },
        tableHeader: {
          bold: true,
          fontSize: 9,
          color: "white",
          fillColor: "#0a4174",
          alignment: "center",
        },
        tableCell: {
          fontSize: 8,
          color: "#333",
        },
        noData: {
          fontSize: 12,
          italics: true,
          color: "#999",
          alignment: "center",
          margin: [0, 20, 0, 20],
        },
        summaryText: {
          fontSize: 11,
          margin: [0, 5, 0, 5],
        },
        footer: {
          fontSize: 8,
          color: "#666",
          alignment: "center",
          margin: [0, 20, 0, 0],
        },
      },
      header: function (currentPage, pageCount) {
        return {
          text: `Sales Forecast Report - Page ${currentPage} of ${pageCount}`,
          style: "footer",
          margin: [40, 20, 40, 0],
        };
      },
      footer: function (currentPage, pageCount) {
        return {
          text: `Generated: ${formatDate(generatedDate)} | ${fileName}`,
          style: "footer",
          margin: [40, 10, 40, 20],
        };
      },
      content: [
        // ========== PAGE 1: EXECUTIVE SUMMARY ==========
        {
          text: "Sales Forecast Report",
          style: "header",
        },
        {
          text: `Generated: ${formatDate(generatedDate)}`,
          style: "summaryText",
          margin: [0, 0, 0, 20],
        },
        {
          text: "Executive Summary",
          style: "subheader",
        },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "7-Day Forecast", style: "subheader", fontSize: 14 },
                { text: `Total Forecasted: ${summary7d.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Average Daily: ${summary7d.avg.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Range: ${summary7d.min.toLocaleString("en-US", { maximumFractionDigits: 2 })} - ${summary7d.max.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Data Points: ${summary7d.count}`, style: "summaryText" },
              ],
            },
            {
              width: "*",
              stack: [
                { text: "30-Day Forecast", style: "subheader", fontSize: 14 },
                { text: `Total Forecasted: ${summary30d.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Average Daily: ${summary30d.avg.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Range: ${summary30d.min.toLocaleString("en-US", { maximumFractionDigits: 2 })} - ${summary30d.max.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Data Points: ${summary30d.count}`, style: "summaryText" },
              ],
            },
            {
              width: "*",
              stack: [
                { text: "90-Day Forecast", style: "subheader", fontSize: 14 },
                { text: `Total Forecasted: ${summary90d.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Average Daily: ${summary90d.avg.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Range: ${summary90d.min.toLocaleString("en-US", { maximumFractionDigits: 2 })} - ${summary90d.max.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, style: "summaryText" },
                { text: `Data Points: ${summary90d.count}`, style: "summaryText" },
              ],
            },
          ],
          margin: [0, 0, 0, 20],
        },
        {
          text: "Inventory Alerts",
          style: "subheader",
        },
        inventoryAlerts.length > 0
          ? {
              text: `High-risk products: ${inventoryAlerts.filter((a) => a.Risk_Level === "HIGH").length}`,
              style: "summaryText",
              margin: [0, 0, 0, 10],
            }
          : {
              text: "No inventory alerts",
              style: "noData",
            },

        // ========== PAGE 2: 7-DAY FORECAST ==========
        {
          text: "7-Day Forecast Details",
          style: "subheader",
          pageBreak: "before",
        },
        createTable(sevenDayData, 25),

        // ========== PAGE 3: 30-DAY FORECAST ==========
        {
          text: "30-Day Forecast Details",
          style: "subheader",
          pageBreak: "before",
        },
        createTable(thirtyDayData, 25),

        // ========== PAGE 4: 90-DAY FORECAST & INVENTORY ALERTS ==========
        {
          text: "90-Day Forecast Details",
          style: "subheader",
          pageBreak: "before",
        },
        createTable(ninetyDayData, 20),
        inventoryAlerts.length > 0
          ? [
              {
                text: "Inventory Alerts",
                style: "subheader",
                margin: [0, 20, 0, 10],
              },
              createTable(inventoryAlerts, 15),
            ]
          : [],
      ],
    };
  }
}

module.exports = new PDFService();