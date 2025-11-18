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

    // Calculate growth rates (stable but safe guards)
    const growthRate7d = summary7d.count > 0 && summary7d.min !== 0 ?
      ((summary7d.max - summary7d.min) / summary7d.min * 100).toFixed(1) : '0.0';
    const growthRate30d = summary30d.count > 0 && summary7d.total !== 0 ?
      ((summary30d.total - summary7d.total) / summary7d.total * 100).toFixed(1) : '0.0';

    // Keep the detailed table builders but we'll move heavy sections off the cover
    const buildProductSummaryTable = (data) => {
      if (!data || data.length === 0) return { text: "No data available", style: "noData" };

      const tableBody = [
        [
          { text: 'Product', style: 'tableHeader', alignment: 'center' },
          { text: 'Last Week', style: 'tableHeader', alignment: 'center' },
          { text: 'Forecast', style: 'tableHeader', alignment: 'center' },
          { text: 'Qty', style: 'tableHeader', alignment: 'center' },
          { text: 'Growth', style: 'tableHeader', alignment: 'center' }
        ]
      ];

      data.slice(0, 5).forEach(row => {
        const lastWeek = parseFloat(row.Last_Week_Sales || row.Historical_Sales || 0);
        const forecast = parseFloat(row.Forecasted_Sales || 0);
        const qty = parseFloat(row.Forecasted_Quantity || row.Quantity || 0);
        const growthRate = lastWeek > 0 ? (((forecast - lastWeek) / lastWeek) * 100).toFixed(1) : '0';

        tableBody.push([
          { text: row.Product_Name || row.Product || row.Product_Category || 'Unknown', style: 'tableCell' },
          { text: this.formatCurrency(lastWeek), style: 'tableCell', alignment: 'right' },
          { text: this.formatCurrency(forecast), style: 'tableCell', alignment: 'right' },
          { text: Math.round(qty).toString(), style: 'tableCell', alignment: 'center' },
          { text: `${growthRate >= 0 ? '+' : ''}${growthRate}%`, style: 'tableCell', alignment: 'center' }
        ]);
      });

      return {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#e2e8f0',
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f8fafc' : null)),
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        }
      };
    };

    const buildDailyForecastTable = (data) => {
      if (!data || data.length === 0) return { text: "No daily forecast data available", style: "noData" };

      const tableBody = [
        [
          { text: 'Date', style: 'tableHeader', alignment: 'center' },
          { text: 'Day', style: 'tableHeader', alignment: 'center' },
          { text: 'Expected', style: 'tableHeader', alignment: 'center' },
          { text: 'Notes', style: 'tableHeader', alignment: 'center' }
        ]
      ];

      data.slice(0, 7).forEach((row) => {
        const sales = parseFloat(row.Forecasted_Sales || 0);
        const dateValue = row.Date || row.Forecast_Date || row.date;
        const date = this.excelDateToJSDate(dateValue);
        const dayName = date && !isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { weekday: 'long' }) : 'N/A';
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
          widths: [70, 90, 'auto', '*'],
          body: tableBody
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#e2e8f0',
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f8fafc' : null)),
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        }
      };
    };

    const buildDetailedTable = (data, maxRows = 15) => {
      if (!data || data.length === 0) return { text: "No data available", style: "noData" };

      const headers = Object.keys(data[0]);
      const displayRows = data.slice(0, maxRows);

      return {
        table: {
          headerRows: 1,
          widths: headers.map(() => 'auto'),
          body: [
            headers.map((h) => ({ text: h.replace(/_/g, ' '), style: 'tableHeader', bold: true })),
            ...displayRows.map((row) =>
              headers.map((header) => {
                const value = row[header];
                if (value === null || value === undefined) return { text: "", style: "tableCell" };
                
                if (header.toLowerCase().includes('date')) {
                  const date = this.excelDateToJSDate(value);
                  return { text: this.formatDate(date), style: "tableCell" };
                }
                
                if (typeof value === "number") {
                  if (header.toLowerCase().includes('sales') || header.toLowerCase().includes('price') || header.toLowerCase().includes('forecast')) {
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
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#e2e8f0",
          vLineColor: () => "#e2e8f0",
          fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f8fafc' : null)),
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      };
    };

    // New, decluttered cover (page 1) — keep it clean and professional. Heavy tables moved to page 2.
    const cover = {
      columns: [
        {
          width: '55%',
          stack: [
            { text: "Sales Forecast Report", style: "title" },
            { text: "Korean Grocery Store", style: "subtitle", margin: [0, 2, 0, 8] },
            { text: `Report: ${this.formatDate(range7d.start)} — ${this.formatDate(range90d.end)}`, style: "meta" },
            { text: `Source: ${fileName}`, style: "meta" },
            { text: `Generated: ${this.formatDateTime(generatedDate)}`, style: "meta", margin: [0, 0, 0, 12] },

            // Short executive summary (concise)
            { text: "Executive Summary", style: "sectionHeaderSimple" },
            {
              ul: [
                `7-Day total forecast: ${this.formatCurrency(summary7d.total)} (avg ${this.formatCurrency(summary7d.avg)}/day)`,
                `30-Day projection: ${this.formatCurrency(summary30d.total)} — growth ${growthRate30d}%`,
                `90-Day projection: ${this.formatCurrency(summary90d.total)} — stable quarter outlook`
              ],
              style: 'summaryText',
              margin: [0, 4, 0, 10]
            },

            { text: "Key recommendation:", bold: true, margin: [0, 6, 0, 2] },
            { text: "Schedule restocks for Thu–Fri; increase weekend staffing; monitor top SKUs.", style: 'summaryText' }
          ]
        },
        {
          width: '45%',
          stack: [
            // Visual metrics box — compact KPI cards for quick scan
            {
              columns: [
                { width: 'auto', text: '' },
                {
                  width: '*',
                  stack: [
                    { text: 'Next 7 Days', style: 'kpiTitle' },
                    { text: this.formatCurrency(summary7d.total), style: 'kpiValue' },
                    { text: `Avg/day ${this.formatCurrency(summary7d.avg)}`, style: 'kpiMeta' }
                  ],
                  margin: [6, 6, 6, 6]
                }
              ],
              columnGap: 6,
              margin: [0, 6, 0, 6]
            },
            {
              columns: [
                { width: 'auto', text: '' },
                {
                  width: '*',
                  stack: [
                    { text: 'Next 30 Days', style: 'kpiTitle' },
                    { text: this.formatCurrency(summary30d.total), style: 'kpiValue' },
                    { text: `Growth ${growthRate30d}%`, style: 'kpiMeta' }
                  ],
                  margin: [6, 6, 6, 6]
                }
              ],
              columnGap: 6,
              margin: [0, 6, 0, 6]
            },
            {
              columns: [
                { width: 'auto', text: '' },
                {
                  width: '*',
                  stack: [
                    { text: 'Next 90 Days', style: 'kpiTitle' },
                    { text: this.formatCurrency(summary90d.total), style: 'kpiValue' },
                    { text: `Quarterly outlook`, style: 'kpiMeta' }
                  ],
                  margin: [6, 6, 6, 6]
                }
              ],
              columnGap: 6,
              margin: [0, 6, 0, 6]
            },

            // Small note / legend
            { text: 'Top insights at a glance — detailed tables follow on the next page.', style: 'meta', margin: [0, 12, 0, 0] }
          ]
        }
      ],
      columnGap: 18
    };

    // Page 2 will contain the heavier tables (product summary + daily forecast)
    const page2 = [
      { text: 'Top Products & 7-Day Daily Forecast', style: 'sectionHeader', pageBreak: 'before' },
      { text: `Period: ${this.formatDate(range7d.start)} — ${this.formatDate(range7d.end)}`, style: 'subtitle', margin: [0, 0, 0, 8] },
      { text: 'Top Products (sample)', style: 'subSection' },
      buildProductSummaryTable(sevenDayData),
      { text: '\n7-Day Daily Forecast', style: 'subSection', margin: [0, 8, 0, 6] },
      buildDailyForecastTable(sevenDayData)
    ];

    // Remaining pages — keep original detail layout but slightly lighter visuals
    const pages = [
      // cover
      cover,
      // page2 content
      ...page2,
      // 7-day detailed breakdown
      {
        text: '7-Day Forecast - Detailed Breakdown',
        style: 'sectionHeader',
        pageBreak: 'before',
        margin: [0, 6, 0, 6]
      },
      { text: `${this.formatDate(range7d.start)} to ${this.formatDate(range7d.end)} | Total: ${this.formatCurrency(summary7d.total)}`, style: 'subtitle', margin: [0, 0, 0, 8] },
      buildDetailedTable(sevenDayData, 20),

      // 30-day
      {
        text: '30-Day Forecast - Detailed Breakdown',
        style: 'sectionHeader',
        pageBreak: 'before',
        margin: [0, 6, 0, 6]
      },
      { text: `${this.formatDate(range30d.start)} to ${this.formatDate(range30d.end)} | Total: ${this.formatCurrency(summary30d.total)}`, style: 'subtitle', margin: [0, 0, 0, 8] },
      buildDetailedTable(thirtyDayData, 20),

      // 90-day
      {
        text: '90-Day Forecast - Detailed Breakdown',
        style: 'sectionHeader',
        pageBreak: 'before',
        margin: [0, 6, 0, 6]
      },
      { text: `${this.formatDate(range90d.start)} to ${this.formatDate(range90d.end)} | Total: ${this.formatCurrency(summary90d.total)}`, style: 'subtitle', margin: [0, 0, 0, 8] },
      buildDetailedTable(ninetyDayData, 15),

      // inventory alerts (if any)
      ...(inventoryAlerts.length > 0 ? [
        { text: 'Inventory Alerts & Recommendations', style: 'sectionHeader', margin: [0, 12, 0, 6] },
        { text: `${inventoryAlerts.filter((a) => a.Risk_Level === 'HIGH').length} HIGH priority items — review immediately.`, style: 'summaryText', margin: [0, 0, 0, 8] },
        buildDetailedTable(inventoryAlerts, 15)
      ] : []),

      // insights & recommendations
      { text: 'Key Insights & Action Items', style: 'sectionHeader', pageBreak: inventoryAlerts.length === 0 ? 'before' : undefined, margin: [0, 12, 0, 6] },
      {
        columns: [
          {
            width: '48%',
            stack: [
              { text: 'Sales Trends', style: 'sectionHeaderSmall', margin: [0, 0, 0, 4] },
              { ul: [
                `Weekend peak expected (max ${this.formatCurrency(summary7d.max)})`,
                `Daily average: ${this.formatCurrency(summary7d.avg)}`,
                `Top SKUs: kimchi, ramyeon, soju`
              ], style: 'summaryText' }
            ]
          },
          { width: '4%', text: '' },
          {
            width: '48%',
            stack: [
              { text: 'Action Items', style: 'sectionHeaderSmall', margin: [0, 0, 0, 4] },
              { ol: [
                'Confirm restock orders by Wednesday',
                'Increase weekend staffing by ~20%',
                'Set automated low-stock alerts for critical items'
              ], style: 'summaryText' }
            ]
          }
        ],
        columnGap: 10
      },

      // methodology
      { text: 'Forecast Methodology', style: 'sectionHeader', margin: [0, 12, 0, 6] },
      { text: [
        { text: 'Data Source: ', bold: true }, 'Historical POS data\n',
        { text: 'Model: ', bold: true }, 'Time-series with seasonal adjustments\n',
        { text: 'Confidence: ', bold: true }, 'Estimates based on past trends\n'
      ], style: 'summaryText', margin: [0, 0, 0, 12] },

      // footer block
      { text: '_____________________________________________________________________________________________', alignment: 'center', margin: [0, 12, 0, 12], color: '#cbd5e1' },
      {
        columns: [
          { width: '50%', text: [ { text: 'Korean Grocery Store\n', bold: true, fontSize: 10 }, { text: 'Sales Forecast System', fontSize: 8, color: '#64748b' } ] },
          { width: '50%', text: [ { text: 'Contact: forecasting@koreangrocery.com\n', fontSize: 8 }, { text: `Generated: ${this.formatDateTime(generatedDate)}`, fontSize: 7, color: '#94a3b8' } ], alignment: 'right' }
        ]
      }
    ];

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [36, 54, 36, 48],
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      styles: {
        title: { fontSize: 20, bold: true, color: '#1e40af', margin: [0, 0, 0, 6] },
        subtitle: { fontSize: 10, color: '#0f172a' },
        meta: { fontSize: 8, color: '#475569' },
        sectionHeader: { fontSize: 14, bold: true, color: '#1e40af' },
        sectionHeaderSimple: { fontSize: 11, bold: true, color: '#1e40af', margin: [0, 6, 0, 4] },
        sectionHeaderSmall: { fontSize: 11, bold: true, color: '#1e40af' },
        subSection: { fontSize: 10, bold: true, color: '#1e3a8a', margin: [0, 8, 0, 6] },
        tableHeader: { bold: true, fontSize: 8, color: '#1e3a8a', fillColor: '#cbd5e1' },
        tableCell: { fontSize: 8, color: '#0f172a' },
        tableCellSmall: { fontSize: 7, color: '#475569' },
        noData: { fontSize: 9, italics: true, color: '#94a3b8', alignment: 'center', margin: [0, 10, 0, 10] },
        summaryText: { fontSize: 9, color: '#334155', margin: [0, 4, 0, 4] },
        footer: { fontSize: 7, color: '#64748b', alignment: 'center' },
        kpiTitle: { fontSize: 9, color: '#1e40af', bold: true },
        kpiValue: { fontSize: 14, bold: true, color: '#0f172a', margin: [0, 4, 0, 2] },
        kpiMeta: { fontSize: 8, color: '#475569' }
      },
      header: function(currentPage) {
        // keep first page header minimal (we have cover)
        if (currentPage === 1) return null;
        return { text: 'Sales Forecast Report', style: 'footer', alignment: 'center', margin: [0, 12, 0, 0] };
      },
      footer: function(currentPage, pageCount) {
        return { text: `Generated: ${this.formatDateTime(generatedDate)} | Page ${currentPage} of ${pageCount}`, style: 'footer', margin: [36, 6, 36, 0] };
      }.bind(this),
      content: pages
    };
  }
}

module.exports = new PDFService();
