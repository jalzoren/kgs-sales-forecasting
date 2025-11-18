// services/pdfService.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Use built-in fonts (no external loading issues)
const fonts = {
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

class PDFService {
  async generateForecastReport(excelFilePath, outputPath) {
    try {
      const workbook = XLSX.readFile(excelFilePath);
      const sheetNames = workbook.SheetNames;

      const data = {
        forecast7d: XLSX.utils.sheet_to_json(workbook.Sheets["7d_forecast"] || workbook.Sheets[sheetNames[0]] || {}),
        alerts: XLSX.utils.sheet_to_json(workbook.Sheets["inventory_alerts"] || {}),
      };

      const docDefinition = this.buildWorkingBeautifulPDF(data);

      const printer = new PdfPrinter(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(outputPath);
        pdfDoc.pipe(stream);
        pdfDoc.end();

        stream.on("finish", () => {
          console.log(`PDF generated successfully: ${outputPath}`);
          resolve(outputPath);
        });
        stream.on("error", reject);
        pdfDoc.on("error", reject);
      });
    } catch (err) {
      console.error("PDF Generation Failed:", err.message);
      throw err;
    }
  }

  buildWorkingBeautifulPDF(data) {
    const weekStart = "17 November 2025";
    const weekEnd = "23 November 2025";
    const generated = new Date().toLocaleDateString("en-GB");

    // Calculate totals safely
    const safeSum = (arr, key) => arr.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);

    const units7d = Math.round(safeSum(data.forecast7d, "Forecast_Qty"));
    const revenue7d = Math.round(safeSum(data.forecast7d, "Revenue_Estimate"));
    const highRiskCount = data.alerts.filter(a => (a.Risk_Level || "").toUpperCase() === "HIGH").length;

    // Top 10
    const top10 = [...data.forecast7d]
      .sort((a, b) => (b.Forecast_Qty || 0) - (a.Forecast_Qty || 0))
      .slice(0, 10)
      .map((p, i) => ({
        rank: i + 1,
        id: p.Product_ID || "N/A",
        name: (p.Product_Name || "Unknown").substring(0, 50),
        cat: p.Category || "Others",
        qty: Math.round(p.Forecast_Qty || 0).toLocaleString(),
        rev: `₩${Math.round(p.Revenue_Estimate || 0).toLocaleString()}`,
      }));

    const formatMil = (n) => `₩${(n / 1000000).toFixed(1)}M`;

    return {
      pageSize: "A4",
      pageOrientation: "portrait",
      pageMargins: [40, 90, 40, 70],
      background: {
        canvas: [
          { type: "rect", x: 0, y: 0, w: 595, h: 80, color: "#1e40af" },
          { type: "rect", x: 0, y: 762, w: 595, h: 80, color: "#f97316" },
        ],
      },

      header: {
        margin: [40, 20, 40, 0],
        columns: [
          { text: "", width: 100 }, // logo placeholder
          {
            text: "WEEKLY SALES & INVENTORY FORECAST REPORT",
            style: "mainTitle",
            alignment: "center",
          },
          { text: "", width: 100 },
        ],
      },

      footer: (currentPage, pageCount) => ({
        margin: [40, 0],
        columns: [
          { text: `Week: ${weekStart} – ${weekEnd}`, fontSize: 9, color: "#666" },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: "center", fontSize: 9, color: "#666" },
          { text: `Generated: ${generated}`, alignment: "right", fontSize: 9, color: "#666" },
        ],
      }),

      styles: {
        mainTitle: { fontSize: 24, bold: true, color: "white" },
        title: { fontSize: 20, bold: true, color: "#1e40af", margin: [0, 20, 0, 10] },
        h1: { fontSize: 16, bold: true, color: "#1e40af", margin: [0, 20, 0, 8] },
        h2: { fontSize: 14, bold: true, color: "#f97316", margin: [0, 15, 0, 6] },
        highlight: { fontSize: 32, bold: true, color: "#dc2626" },
        cardTitle: { fontSize: 13, bold: true, color: "white", fillColor: "#1e40af", margin: [0, 8, 0, 4], alignment: "center" },
        cardValue: { fontSize: 22, bold: true, color: "white", alignment: "center" },
        alert: { fontSize: 12, bold: true, color: "#dc2626" },
      },

      defaultStyle: { fontSize: 10, color: "#1f2937" },

      content: [
        // Hero Section
        {
          columns: [
            {
              width: "65%",
              stack: [
                { text: "Weekly Forecast Report", style: "title" },
                { text: `${weekStart} – ${weekEnd}`, fontSize: 18, bold: true, color: "#f97316" },
                { text: "All Branches • Korean Grocery Chain", fontSize: 12, color: "#475569", margin: [0, 5] },
              ],
            },
            {
              width: "35%",
              stack: [
                {
                  stack: [
                    { text: "7-Day Total Forecast", style: "cardTitle" },
                    { text: units7d.toLocaleString(), style: "cardValue" },
                    { text: "units", fontSize: 14, color: "#e0e7ff", alignment: "center" },
                    { text: formatMil(revenue7d), fontSize: 18, color: "white", alignment: "center", margin: [0, 5] },
                  ],
                  fillColor: "#1e40af",
                  margin: [20, 0],
                  padding: [0, 10],
                  borderRadius: 8,
                },
                {
                  stack: [
                    { text: "HIGH RISK STOCKOUTS", style: "cardTitle", fillColor: "#dc2626" },
                    { text: highRiskCount, style: "highlight" },
                    { text: "items need URGENT restock", fontSize: 11, color: "white", alignment: "center" },
                  ],
                  margin: [20, 15, 0, 0],
                  padding: [0, 10],
                  borderRadius: 8,
                },
              ],
            },
          ],
        },

        // Top 10 Table
        { text: "Top 10 Fastest Moving Products (7-Day Forecast)", style: "h1" },
        {
          table: {
            headerRows: 1,
            widths: [30, 60, "*", 90, 80, 90],
            body: [
              [
                { text: "#", style: "tableHeader", fillColor: "#1e40af", color: "white" },
                { text: "Code", style: "tableHeader", fillColor: "#1e40af", color: "white" },
                { text: "Product Name", style: "tableHeader", fillColor: "#1e40af", color: "white" },
                { text: "Category", style: "tableHeader", fillColor: "#1e40af", color: "white" },
                { text: "Qty", style: "tableHeader", fillColor: "#1e40af", color: "white", alignment: "center" },
                { text: "Est. Revenue", style: "tableHeader", fillColor: "#1e40af", color: "white", alignment: "right" },
              ],
              ...top10.map(p => [
                { text: p.rank, bold: true, color: "#f97316" },
                p.id,
                p.name,
                { text: p.cat, color: "#64748b" },
                { text: p.qty, alignment: "center", bold: true },
                { text: p.rev, alignment: "right", bold: true },
              ]),
            ],
          },
          layout: {
            fillColor: i => i === 0 ? null : (i % 2 === 0 ? "#f8fafc" : null),
          },
        },

        // Critical Alerts
        { text: "CRITICAL RESTOCK ALERTS – HIGH RISK", style: "h2", pageBreak: "before" },
        { text: `Urgent purchase orders required for ${highRiskCount} items to avoid weekend stockouts`, style: "alert", margin: [0, 0, 0, 10] },
        {
          ul: data.alerts
            .filter(a => (a.Risk_Level || "").toUpperCase() === "HIGH")
            .slice(0, 20)
            .map(a => `${a.Product_ID} – ${a.Product_Name} (${Math.round(a.Forecast_Qty || a["7d_Forecast_Qty"] || 0)} units needed)`),
          color: "#dc2626",
          fontSize: 11,
          bold: true,
          margin: [20, 0, 0, 20],
        },

        // Final Call to Action
        {
          text: "ACTION REQUIRED TODAY: Place POs for all Condiments & Kimchi before Thursday",
          style: "alert",
          fontSize: 15,
          alignment: "center",
          fillColor: "#fef3c7",
          margin: [0, 30, 0, 0],
          padding: 15,
        },
      ],
    };
  }
}

module.exports = new PDFService();