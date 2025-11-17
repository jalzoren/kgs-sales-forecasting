// services/pdfService.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Define fonts for apdfmake with better error handling
let fonts;
try {
  const fontsPath = path.join(__dirname, "../../node_modules/pdfmake/build/vfs_fonts.js");
  
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
  async generateForecastReport(excelFilePath, outputPath) {
    try {
      console.log(`📄 Starting PDF generation...`);
      console.log(`   Excel file: ${excelFilePath}`);
      console.log(`   Output path: ${outputPath}`);

      if (!fs.existsSync(excelFilePath)) {
        throw new Error(`Excel file not found: ${excelFilePath}`);
      }
      console.log(`✓ Excel file exists`);

      try {
        fs.accessSync(excelFilePath, fs.constants.R_OK);
        console.log(`✓ Excel file is readable`);
      } catch (err) {
        throw new Error(`Cannot read Excel file (permission denied): ${excelFilePath}`);
      }

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

      const fileName = path.basename(excelFilePath);
      const fileStats = fs.statSync(excelFilePath);
      const generatedDate = fileStats.mtime;

      const outputDir = path.dirname(outputPath);
      console.log(`📁 Checking output directory: ${outputDir}`);
      
      if (!fs.existsSync(outputDir)) {
        console.log(`   Creating output directory...`);
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`   ✓ Directory created`);
      } else {
        console.log(`   ✓ Directory exists`);
      }

      try {
        fs.accessSync(outputDir, fs.constants.W_OK);
        console.log(`✓ Output directory is writable`);
      } catch (err) {
        throw new Error(`Cannot write to output directory (permission denied): ${outputDir}`);
      }

      console.log(`🔨 Building PDF document...`);
      const docDefinition = this.buildPDFDocument(fileName, generatedDate, sheetsData);
      console.log(`✓ Document definition created`);

      console.log(`📝 Creating PDF...`);
      const printer = new PdfPrinter(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputPath);
        
        writeStream.on("open", () => {
          console.log(`✓ Write stream opened`);
        });

        pdfDoc.pipe(writeStream);

        pdfDoc.on("end", () => {
          console.log(`✅ PDF generation completed successfully`);
          console.log(`   Output: ${outputPath}`);
          
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

  buildPDFDocument(fileName, generatedDate, sheetsData) {
    const sevenDayData = sheetsData["7d_forecast"] || [];
    const thirtyDayData = sheetsData["30d_forecast"] || [];
    const ninetyDayData = sheetsData["90d_forecast"] || [];
    const inventoryAlerts = sheetsData["inventory_alerts"] || [];

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const formatCurrency = (value) => {
      if (!value && value !== 0) return "₱0.00";
      return `₱${parseFloat(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

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

    // Build product forecast summary table (like left table in image)
    const buildProductSummaryTable = (data) => {
      if (!data || data.length === 0) {
        return { text: "No data available", style: "noData" };
      }

      const tableBody = [
        [
          { text: 'Product\nCategory', style: 'tableHeader', alignment: 'center' },
          { text: 'Last Week\nSales', style: 'tableHeader', alignment: 'center' },
          { text: 'Forecasted Sales', style: 'tableHeader', alignment: 'center' },
          { text: 'Forecast\nted Qty', style: 'tableHeader', alignment: 'center' },
          { text: 'Growth\nRate (%)', style: 'tableHeader', alignment: 'center' },
          { text: 'Remarks', style: 'tableHeader', alignment: 'center' }
        ]
      ];

      let totalLastWeek = 0;
      let totalForecast = 0;
      let totalQty = 0;

      data.slice(0, 5).forEach(row => {
        const lastWeek = parseFloat(row.Last_Week_Sales || row.Historical_Sales || 0);
        const forecast = parseFloat(row.Forecasted_Sales || 0);
        const qty = parseFloat(row.Forecasted_Quantity || row.Quantity || 0);
        const growthRate = lastWeek > 0 ? (((forecast - lastWeek) / lastWeek) * 100).toFixed(1) : '0';
        
        totalLastWeek += lastWeek;
        totalForecast += forecast;
        totalQty += qty;

        tableBody.push([
          { text: row.Product_Name || row.Product || row.Product_Category || 'Unknown', style: 'tableCell' },
          { text: formatCurrency(lastWeek), style: 'tableCell', alignment: 'right' },
          { text: formatCurrency(forecast), style: 'tableCell', alignment: 'right' },
          { text: Math.round(qty).toString(), style: 'tableCell', alignment: 'center' },
          { text: `+${growthRate}%`, style: 'tableCell', alignment: 'center' },
          { text: forecast > lastWeek ? 'High demand' : 'Stable sales', style: 'tableCellSmall' }
        ]);
      });

      // Add total row
      const totalGrowth = totalLastWeek > 0 ? (((totalForecast - totalLastWeek) / totalLastWeek) * 100).toFixed(1) : '0';
      tableBody.push([
        { text: 'Total', style: 'tableCell', bold: true },
        { text: formatCurrency(totalLastWeek), style: 'tableCell', alignment: 'right', bold: true },
        { text: formatCurrency(totalForecast), style: 'tableCell', alignment: 'right', bold: true },
        { text: Math.round(totalQty).toString(), style: 'tableCell', alignment: 'center', bold: true },
        { text: `+${totalGrowth}%`, style: 'tableCell', alignment: 'center', bold: true },
        { text: '', style: 'tableCell' }
      ]);

      return {
        table: {
          headerRows: 1,
          widths: [80, 60, 70, 50, 50, 90],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#94a3b8',
          vLineColor: () => '#94a3b8',
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f1f5f9' : null)),
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        }
      };
    };

    // Build forecast summary table (like right table in image)
    const buildForecastSummaryTable = () => {
      return {
        table: {
          headerRows: 1,
          widths: [100, 90, 90, 110],
          body: [
            [
              { text: 'Forecast Period', style: 'tableHeader', alignment: 'center' },
              { text: 'Total\nForecasted\nSales (₱)', style: 'tableHeader', alignment: 'center' },
              { text: 'Average Daily\nSales (₱)', style: 'tableHeader', alignment: 'center' },
              { text: 'Key\nHighlig\nhts', style: 'tableHeader', alignment: 'center' }
            ],
            [
              { text: 'Next 7 Days', style: 'tableCell' },
              { text: formatCurrency(summary7d.total), style: 'tableCell', alignment: 'right' },
              { text: formatCurrency(summary7d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Weekend peaks\n(₱4,000+)\nRestock\nThu-Fri', style: 'tableCellSmall' }
            ],
            [
              { text: 'Next 30 Days', style: 'tableCell' },
              { text: formatCurrency(summary30d.total), style: 'tableCell', alignment: 'right' },
              { text: formatCurrency(summary30d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Steady\nmonth-\nlong\ntrend.\nHighest\naround\n2nd-3rd\nweek', style: 'tableCellSmall' }
            ],
            [
              { text: 'Next 90 Days', style: 'tableCell' },
              { text: formatCurrency(summary90d.total), style: 'tableCell', alignment: 'right' },
              { text: formatCurrency(summary90d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Stable\nquarterly\ngrowth;\nConsist\nent\nweekend\ndemand', style: 'tableCellSmall' }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#94a3b8',
          vLineColor: () => '#94a3b8',
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f1f5f9' : null)),
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        }
      };
    };

    // Build daily forecast table (7 days)
    const buildDailyForecastTable = (data) => {
      if (!data || data.length === 0) {
        return { text: "No daily forecast data available", style: "noData" };
      }

      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const tableBody = [
        [
          { text: 'Day', style: 'tableHeader', alignment: 'center' },
          { text: 'Expected\nSales', style: 'tableHeader', alignment: 'center' },
          { text: 'Notes', style: 'tableHeader', alignment: 'center' }
        ]
      ];

      data.slice(0, 7).forEach((row, index) => {
        const sales = parseFloat(row.Forecasted_Sales || 0);
        const dayName = days[index] || `Day ${index + 1}`;
        let notes = 'Regular flow';
        
        if (sales > summary7d.avg * 1.1) notes = 'Higher afternoon sales';
        if (dayName.includes('Saturday') || dayName.includes('Sunday')) notes = 'Peak day';
        if (sales < summary7d.avg * 0.9) notes = 'Stable';

        tableBody.push([
          { text: dayName, style: 'tableCell' },
          { text: formatCurrency(sales), style: 'tableCell', alignment: 'right' },
          { text: notes, style: 'tableCellSmall' }
        ]);
      });

      return {
        table: {
          headerRows: 1,
          widths: [80, 80, 110],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#94a3b8',
          vLineColor: () => '#94a3b8',
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f1f5f9' : null)),
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        }
      };
    };

    // Build detailed data table
    const buildDetailedTable = (data, maxRows = 15) => {
      if (!data || data.length === 0) {
        return { text: "No data available", style: "noData" };
      }

      const headers = Object.keys(data[0]);
      const displayRows = data.slice(0, maxRows);

      return {
        table: {
          headerRows: 1,
          widths: headers.map(() => 'auto'),
          body: [
            headers.map((h) => ({ 
              text: h.replace(/_/g, ' '), 
              style: 'tableHeader',
              bold: true 
            })),
            ...displayRows.map((row) =>
              headers.map((header) => {
                const value = row[header];
                if (value === null || value === undefined) return { text: "", style: "tableCell" };
                if (typeof value === "number") {
                  if (header.toLowerCase().includes('sales') || 
                      header.toLowerCase().includes('price') || 
                      header.toLowerCase().includes('forecast')) {
                    return { text: formatCurrency(value), style: "tableCell", alignment: 'right' };
                  }
                  return { text: value.toLocaleString("en-US", { maximumFractionDigits: 2 }), style: "tableCell", alignment: 'right' };
                }
                return { text: String(value), style: "tableCell" };
              })
            ),
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => "#94a3b8",
          vLineColor: () => "#94a3b8",
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f8fafc' : null)),
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      };
    };

    return {
      pageSize: "A4",
      pageOrientation: 'portrait',
      pageMargins: [30, 60, 30, 50],
      defaultStyle: {
        font: "Roboto",
        fontSize: 9,
      },
      styles: {
        title: {
          fontSize: 18,
          bold: true,
          color: "#1e40af",
          margin: [0, 0, 0, 3],
        },
        subtitle: {
          fontSize: 10,
          color: "#000000",
          margin: [0, 0, 0, 2],
        },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          color: "#1e40af",
          margin: [0, 12, 0, 8],
        },
        tableHeader: {
          bold: true,
          fontSize: 8,
          color: "#1e3a8a",
          fillColor: '#cbd5e1',
          alignment: "left",
        },
        tableCell: {
          fontSize: 8,
          color: "#1f2937",
          alignment: "left",
        },
        tableCellSmall: {
          fontSize: 7,
          color: "#475569",
          alignment: "left",
        },
        noData: {
          fontSize: 9,
          italics: true,
          color: "#94a3b8",
          alignment: "center",
          margin: [0, 15, 0, 15],
        },
        summaryText: {
          fontSize: 9,
          margin: [0, 3, 0, 3],
          color: "#334155",
        },
        footer: {
          fontSize: 7,
          color: "#64748b",
          alignment: "center",
        },
      },
      header: function (currentPage) {
        if (currentPage === 1) return null;
        return {
          text: 'Sales Forecast Report', 
          style: 'footer',
          alignment: 'center',
          margin: [0, 15, 0, 0]
        };
      },
      footer: function (currentPage, pageCount) {
        return {
          text: `Generated: ${formatDate(generatedDate)} | Page ${currentPage} of ${pageCount}`,
          style: "footer",
          margin: [30, 10, 30, 0],
        };
      },
      content: [
        // ========== PAGE 1: LEFT SIDE - COVER & SUMMARY ==========
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: "Sample Sales Forecast Report", style: "title" },
                { text: "Korean Grocery Store", style: "subtitle" },
                { text: "Report Period:", style: "subtitle", margin: [0, 5, 0, 0] },
                { text: "Data Source:", style: "subtitle" },
                { text: `Date Generated: ${formatDate(generatedDate)}`, style: "subtitle", margin: [0, 0, 0, 15] },
                
                { text: "Executive Summary", style: "sectionHeader" },
                {
                  text: `This 1-week forecast is generated from the POS sales data of October 3-9, 2025. Sales are expected to increase by ${summary7d.count > 0 ? ((summary7d.total / (summary7d.count * summary7d.avg)) * 100).toFixed(1) : '9.5'}% in the upcoming week, mainly driven by higher demand for kimchi and ramyeon. Total forecasted sales are ${formatCurrency(summary7d.total)}.`,
                  style: "summaryText",
                  alignment: 'justify',
                  margin: [0, 0, 0, 15]
                },
                
                { text: "Forecast Summary Table", style: "sectionHeader" },
                buildProductSummaryTable(sevenDayData),
              ]
            },
            {
              width: '50%',
              stack: [
                { text: "Daily Forecast (Next 7 days)", style: "sectionHeader", margin: [0, 80, 0, 8] },
                buildDailyForecastTable(sevenDayData),
                
                { text: "Sales Forecast Summary", style: "sectionHeader", margin: [0, 15, 0, 8] },
                buildForecastSummaryTable(),
              ]
            }
          ],
          columnGap: 15
        },

        // ========== PAGE 2: 7-DAY DETAILS ==========
        {
          text: "7-Day Forecast - Detailed Breakdown",
          style: "sectionHeader",
          pageBreak: "before",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(sevenDayData, 20),

        // ========== PAGE 3: 30-DAY DETAILS ==========
        {
          text: "30-Day Forecast - Detailed Breakdown",
          style: "sectionHeader",
          pageBreak: "before",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(thirtyDayData, 20),

        // ========== PAGE 4: 90-DAY & ALERTS ==========
        {
          text: "90-Day Forecast - Detailed Breakdown",
          style: "sectionHeader",
          pageBreak: "before",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(ninetyDayData, 15),

        inventoryAlerts.length > 0 ? [
          {
            text: "Inventory Alerts",
            style: "sectionHeader",
            margin: [0, 15, 0, 8],
          },
          {
            text: `⚠️ High-risk products requiring attention: ${inventoryAlerts.filter((a) => a.Risk_Level === "HIGH").length}`,
            style: "summaryText",
            color: '#dc2626',
            margin: [0, 0, 0, 8],
          },
          buildDetailedTable(inventoryAlerts, 15),
        ] : []
      ],
    };
  }
}

module.exports = new PDFService();