// services/pdfService.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Define fonts for pdfmake with better error handling
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
  // Convert Excel serial date to JavaScript Date
  excelDateToJSDate(excelDate) {
    if (!excelDate) return null;
    
    // If it's already a date string or Date object
    if (excelDate instanceof Date) return excelDate;
    if (typeof excelDate === 'string' && excelDate.includes('-')) {
      return new Date(excelDate);
    }
    
    // Convert Excel serial number to date
    // Excel dates start from 1900-01-01 (serial 1)
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
    const jsDate = new Date(excelEpoch.getTime() + excelDate * 86400000);
    return jsDate;
  }

  // Format date for display
  formatDate(date) {
    if (!date) return "N/A";
    const d = date instanceof Date ? date : this.excelDateToJSDate(date);
    if (!d || isNaN(d.getTime())) return "N/A";
    
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Format datetime for display
  formatDateTime(date) {
    if (!date) return "N/A";
    const d = date instanceof Date ? date : new Date(date);
    if (!d || isNaN(d.getTime())) return "N/A";
    
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Format currency
  formatCurrency(value) {
    if (!value && value !== 0) return "₱0.00";
    return `₱${parseFloat(value).toLocaleString("en-US", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }

  // Get date range from forecast data
  getDateRange(data) {
    if (!data || data.length === 0) return { start: null, end: null };
    
    const dates = data
      .map(row => {
        const dateValue = row.Date || row.Forecast_Date || row.date;
        return this.excelDateToJSDate(dateValue);
      })
      .filter(d => d && !isNaN(d.getTime()))
      .sort((a, b) => a - b);
    
    if (dates.length === 0) return { start: null, end: null };
    
    return {
      start: dates[0],
      end: dates[dates.length - 1]
    };
  }

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
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: "",
            raw: false  // This helps preserve date values
          });
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

    // Get date ranges for each forecast period
    const range7d = this.getDateRange(sevenDayData);
    const range30d = this.getDateRange(thirtyDayData);
    const range90d = this.getDateRange(ninetyDayData);

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

    // Calculate growth rates
    const growthRate7d = summary7d.count > 0 ? 
      ((summary7d.max - summary7d.min) / summary7d.min * 100).toFixed(1) : '0.0';
    const growthRate30d = summary30d.count > 0 ? 
      ((summary30d.total - summary7d.total) / summary7d.total * 100).toFixed(1) : '0.0';

    // Build product forecast summary table
    const buildProductSummaryTable = (data) => {
      if (!data || data.length === 0) {
        return { text: "No data available", style: "noData" };
      }

      const tableBody = [
        [
          { text: 'Product\nCategory', style: 'tableHeader', alignment: 'center' },
          { text: 'Last Week\nSales', style: 'tableHeader', alignment: 'center' },
          { text: 'Forecasted\nSales', style: 'tableHeader', alignment: 'center' },
          { text: 'Forecasted\nQty', style: 'tableHeader', alignment: 'center' },
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
          { text: this.formatCurrency(lastWeek), style: 'tableCell', alignment: 'right' },
          { text: this.formatCurrency(forecast), style: 'tableCell', alignment: 'right' },
          { text: Math.round(qty).toString(), style: 'tableCell', alignment: 'center' },
          { text: `${growthRate >= 0 ? '+' : ''}${growthRate}%`, style: 'tableCell', alignment: 'center' },
          { text: forecast > lastWeek ? 'High demand' : 'Stable sales', style: 'tableCellSmall' }
        ]);
      });

      // Add total row
      const totalGrowth = totalLastWeek > 0 ? (((totalForecast - totalLastWeek) / totalLastWeek) * 100).toFixed(1) : '0';
      tableBody.push([
        { text: 'Total', style: 'tableCell', bold: true },
        { text: this.formatCurrency(totalLastWeek), style: 'tableCell', alignment: 'right', bold: true },
        { text: this.formatCurrency(totalForecast), style: 'tableCell', alignment: 'right', bold: true },
        { text: Math.round(totalQty).toString(), style: 'tableCell', alignment: 'center', bold: true },
        { text: `${totalGrowth >= 0 ? '+' : ''}${totalGrowth}%`, style: 'tableCell', alignment: 'center', bold: true },
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

    // Build forecast summary table with date ranges
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
              { text: 'Key Highlights', style: 'tableHeader', alignment: 'center' }
            ],
            [
              { 
                text: `Next 7 Days\n${this.formatDate(range7d.start)} to\n${this.formatDate(range7d.end)}`, 
                style: 'tableCell' 
              },
              { text: this.formatCurrency(summary7d.total), style: 'tableCell', alignment: 'right' },
              { text: this.formatCurrency(summary7d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Weekend peaks expected. Restock Thu-Fri', style: 'tableCellSmall' }
            ],
            [
              { 
                text: `Next 30 Days\n${this.formatDate(range30d.start)} to\n${this.formatDate(range30d.end)}`, 
                style: 'tableCell' 
              },
              { text: this.formatCurrency(summary30d.total), style: 'tableCell', alignment: 'right' },
              { text: this.formatCurrency(summary30d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Steady month-long trend. Highest around 2nd-3rd week', style: 'tableCellSmall' }
            ],
            [
              { 
                text: `Next 90 Days\n${this.formatDate(range90d.start)} to\n${this.formatDate(range90d.end)}`, 
                style: 'tableCell' 
              },
              { text: this.formatCurrency(summary90d.total), style: 'tableCell', alignment: 'right' },
              { text: this.formatCurrency(summary90d.avg), style: 'tableCell', alignment: 'right' },
              { text: 'Stable quarterly growth. Consistent weekend demand', style: 'tableCellSmall' }
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

    // Build daily forecast table with actual dates
    const buildDailyForecastTable = (data) => {
      if (!data || data.length === 0) {
        return { text: "No daily forecast data available", style: "noData" };
      }

      const tableBody = [
        [
          { text: 'Date', style: 'tableHeader', alignment: 'center' },
          { text: 'Day', style: 'tableHeader', alignment: 'center' },
          { text: 'Expected\nSales', style: 'tableHeader', alignment: 'center' },
          { text: 'Notes', style: 'tableHeader', alignment: 'center' }
        ]
      ];

      data.slice(0, 7).forEach((row) => {
        const sales = parseFloat(row.Forecasted_Sales || 0);
        const dateValue = row.Date || row.Forecast_Date || row.date;
        const date = this.excelDateToJSDate(dateValue);
        const dayName = date && !isNaN(date.getTime()) ? 
          date.toLocaleDateString('en-US', { weekday: 'long' }) : 'N/A';
        const dateStr = this.formatDate(date);
        
        let notes = 'Regular flow';
        if (sales > summary7d.avg * 1.1) notes = 'Higher afternoon sales';
        if (dayName.includes('Saturday') || dayName.includes('Sunday')) notes = 'Peak day';
        if (sales < summary7d.avg * 0.9) notes = 'Stable';

        tableBody.push([
          { text: dateStr, style: 'tableCell', alignment: 'center' },
          { text: dayName, style: 'tableCell' },
          { text: this.formatCurrency(sales), style: 'tableCell', alignment: 'right' },
          { text: notes, style: 'tableCellSmall' }
        ]);
      });

      return {
        table: {
          headerRows: 1,
          widths: [70, 70, 70, 100],
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

    // Build detailed data table with formatted dates
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
                
                // Check if this is a date field
                if (header.toLowerCase().includes('date')) {
                  const date = this.excelDateToJSDate(value);
                  return { text: this.formatDate(date), style: "tableCell" };
                }
                
                // Check if this is a currency field
                if (typeof value === "number") {
                  if (header.toLowerCase().includes('sales') || 
                      header.toLowerCase().includes('price') || 
                      header.toLowerCase().includes('forecast')) {
                    return { text: this.formatCurrency(value), style: "tableCell", alignment: 'right' };
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
          text: `Generated: ${this.formatDateTime(generatedDate)} | Page ${currentPage} of ${pageCount}`,
          style: "footer",
          margin: [30, 10, 30, 0],
        };
      }.bind(this),
      content: [
        // ========== PAGE 1: COVER & EXECUTIVE SUMMARY ==========
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: "Sales Forecast Report", style: "title" },
                { text: "Korean Grocery Store", style: "subtitle" },
                { text: `Report Period: ${this.formatDate(range7d.start)} - ${this.formatDate(range90d.end)}`, style: "subtitle", margin: [0, 5, 0, 0] },
                { text: `Data Source: ${fileName}`, style: "subtitle" },
                { text: `Date Generated: ${this.formatDateTime(generatedDate)}`, style: "subtitle", margin: [0, 0, 0, 15] },
                
                { text: "Executive Summary", style: "sectionHeader" },
                {
                  text: [
                    `This forecast is generated from historical POS sales data. Based on the analysis:\n\n`,
                    `• `,
                    { text: '7-Day Forecast: ', bold: true },
                    `Sales are expected to reach ${this.formatCurrency(summary7d.total)} (avg ${this.formatCurrency(summary7d.avg)}/day)\n`,
                    `• `,
                    { text: '30-Day Forecast: ', bold: true },
                    `Projected sales of ${this.formatCurrency(summary30d.total)} with growth rate of ${growthRate30d}%\n`,
                    `• `,
                    { text: '90-Day Forecast: ', bold: true },
                    `Quarterly projection of ${this.formatCurrency(summary90d.total)}\n\n`,
                    `Key drivers include higher demand for kimchi and ramyeon products during weekends and special occasions.`
                  ],
                  style: "summaryText",
                  alignment: 'justify',
                  margin: [0, 0, 0, 15]
                },
                
                { text: "Top Products Forecast", style: "sectionHeader" },
                buildProductSummaryTable(sevenDayData),
              ]
            },
            {
              width: '50%',
              stack: [
                { text: "7-Day Daily Forecast", style: "sectionHeader", margin: [0, 80, 0, 8] },
                { text: `Period: ${this.formatDate(range7d.start)} - ${this.formatDate(range7d.end)}`, style: "subtitle", margin: [0, 0, 0, 8] },
                buildDailyForecastTable(sevenDayData),
                
                { text: "Forecast Summary by Period", style: "sectionHeader", margin: [0, 15, 0, 8] },
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
          margin: [0, 0, 0, 5]
        },
        {
          text: `${this.formatDate(range7d.start)} to ${this.formatDate(range7d.end)} | Total: ${this.formatCurrency(summary7d.total)}`,
          style: "subtitle",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(sevenDayData, 20),

        // ========== PAGE 3: 30-DAY DETAILS ==========
        {
          text: "30-Day Forecast - Detailed Breakdown",
          style: "sectionHeader",
          pageBreak: "before",
          margin: [0, 0, 0, 5]
        },
        {
          text: `${this.formatDate(range30d.start)} to ${this.formatDate(range30d.end)} | Total: ${this.formatCurrency(summary30d.total)}`,
          style: "subtitle",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(thirtyDayData, 20),

        // ========== PAGE 4: 90-DAY DETAILS ==========
        {
          text: "90-Day Forecast - Detailed Breakdown",
          style: "sectionHeader",
          pageBreak: "before",
          margin: [0, 0, 0, 5]
        },
        {
          text: `${this.formatDate(range90d.start)} to ${this.formatDate(range90d.end)} | Total: ${this.formatCurrency(summary90d.total)}`,
          style: "subtitle",
          margin: [0, 0, 0, 10]
        },
        buildDetailedTable(ninetyDayData, 15),

        // ========== INVENTORY ALERTS (if available) ==========
        ...(inventoryAlerts.length > 0 ? [
          {
            text: "Inventory Alerts & Recommendations",
            style: "sectionHeader",
            margin: [0, 15, 0, 8],
          },
          {
            text: [
              `⚠️ `,
              { text: 'Critical Alerts: ', bold: true, color: '#dc2626' },
              `${inventoryAlerts.filter((a) => a.Risk_Level === "HIGH").length} high-risk products requiring immediate attention\n`,
              `⚡ `,
              { text: 'Medium Priority: ', bold: true, color: '#f59e0b' },
              `${inventoryAlerts.filter((a) => a.Risk_Level === "MEDIUM").length} products need monitoring`
            ],
            style: "summaryText",
            margin: [0, 0, 0, 10],
          },
          buildDetailedTable(inventoryAlerts, 15),
          {
            text: "Recommendations",
            style: "sectionHeader",
            margin: [0, 15, 0, 8],
          },
          {
            ul: [
              'Restock high-risk items within 48 hours to prevent stockouts',
              'Monitor medium-risk items and place orders within the week',
              'Increase inventory for weekend peak periods (Friday-Sunday)',
              'Consider bulk ordering for high-demand items (kimchi, ramyeon) to optimize costs',
              'Review slow-moving items and plan promotional activities'
            ],
            style: 'summaryText',
            margin: [0, 0, 0, 10]
          }
        ] : []),

        // ========== INSIGHTS & RECOMMENDATIONS ==========
        {
          text: "Key Insights & Action Items",
          style: "sectionHeader",
          pageBreak: inventoryAlerts.length === 0 ? "before" : undefined,
          margin: [0, 15, 0, 8],
        },
        {
          columns: [
            {
              width: '48%',
              stack: [
                { text: '📊 Sales Trends', style: 'sectionHeader', fontSize: 11, margin: [0, 0, 0, 5] },
                {
                  ul: [
                    `Peak sales expected on weekends (${this.formatCurrency(summary7d.max)} max)`,
                    `Daily average: ${this.formatCurrency(summary7d.avg)}`,
                    `Weekly growth rate: ${growthRate7d}%`,
                    'Strong demand for Korean staples (kimchi, ramyeon, soju)'
                  ],
                  style: 'summaryText',
                  margin: [0, 0, 0, 10]
                },
                { text: '💡 Recommendations', style: 'sectionHeader', fontSize: 11, margin: [0, 5, 0, 5] },
                {
                  ul: [
                    'Schedule deliveries for Thursday-Friday',
                    'Increase weekend staffing by 20%',
                    'Prepare promotional bundles for peak days',
                    'Monitor inventory levels daily during high-demand periods'
                  ],
                  style: 'summaryText'
                }
              ]
            },
            {
              width: '4%',
              text: ''
            },
            {
              width: '48%',
              stack: [
                { text: '🎯 Action Items', style: 'sectionHeader', fontSize: 11, margin: [0, 0, 0, 5] },
                {
                  ol: [
                    { text: ['Review and confirm restock orders by ', { text: 'Wednesday', bold: true }] },
                    'Update promotional materials for high-demand products',
                    'Brief staff on expected busy periods and product availability',
                    'Set up automated low-stock alerts for critical items',
                    'Plan inventory audit for end of forecast period'
                  ],
                  style: 'summaryText',
                  margin: [0, 0, 0, 10]
                },
                { text: '⚠️ Risk Factors', style: 'sectionHeader', fontSize: 11, margin: [0, 5, 0, 5] },
                {
                  ul: [
                    'Potential supply chain delays during holidays',
                    'Weather-related delivery disruptions',
                    'Competitor promotional activities',
                    'Seasonal demand fluctuations'
                  ],
                  style: 'summaryText',
                  color: '#dc2626'
                }
              ]
            }
          ],
          columnGap: 10,
          margin: [0, 0, 0, 15]
        },

        // ========== METHODOLOGY & NOTES ==========
        {
          text: "Forecast Methodology",
          style: "sectionHeader",
          margin: [0, 15, 0, 8],
        },
        {
          text: [
            { text: 'Data Source: ', bold: true },
            'Historical POS transaction data\n',
            { text: 'Forecast Model: ', bold: true },
            'Time-series analysis with seasonal adjustments\n',
            { text: 'Confidence Level: ', bold: true },
            'Based on historical patterns and current trends\n',
            { text: 'Update Frequency: ', bold: true },
            'Weekly refresh recommended for optimal accuracy\n\n',
            { text: 'Note: ', bold: true, italics: true },
            { text: 'Forecasts are estimates based on historical data and may vary due to external factors such as holidays, promotions, weather, and market conditions. Regular monitoring and adjustments are recommended.', italics: true, color: '#64748b' }
          ],
          style: 'summaryText',
          margin: [0, 0, 0, 20]
        },

        // ========== FOOTER SECTION ==========
        {
          text: '___________________________________________________________________________________________________________',
          alignment: 'center',
          margin: [0, 10, 0, 10],
          color: '#cbd5e1'
        },
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: 'Korean Grocery Store\n', bold: true, fontSize: 10 },
                { text: 'Sales Forecast System\n', fontSize: 8, color: '#64748b' },
                { text: 'For internal use only', fontSize: 7, color: '#94a3b8', italics: true }
              ]
            },
            {
              width: '50%',
              text: [
                { text: 'Questions or concerns?\n', fontSize: 8, color: '#64748b' },
                { text: 'Contact: forecasting@koreangrocery.com\n', fontSize: 8 },
                { text: `Report generated: ${this.formatDateTime(generatedDate)}`, fontSize: 7, color: '#94a3b8' }
              ],
              alignment: 'right'
            }
          ]
        }
      ],
    };
  }
}

module.exports = new PDFService();