// services/pdfService.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ----- FIX: Proper Roboto TTF fonts -----
const fonts = {
  Roboto: {
    normal: path.join(__dirname, "fonts/Roboto-Regular.ttf"),
    bold: path.join(__dirname, "fonts/Roboto-Medium.ttf"),
    italics: path.join(__dirname, "fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(__dirname, "fonts/Roboto-MediumItalic.ttf")
  }
};

class PDFService {
  excelDateToJSDate(excelDate) {
    if (!excelDate) return null;
    if (excelDate instanceof Date) return excelDate;
    if (typeof excelDate === 'string' && excelDate.includes('-')) {
      return new Date(excelDate);
    }
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + excelDate * 86400000);
  }

  formatDate(date) {
    if (!date) return "N/A";
    const d = date instanceof Date ? date : this.excelDateToJSDate(date);
    if (!d || isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  formatDateTime(date) {
    if (!date) return "N/A";
    const d = date instanceof Date ? date : new Date(date);
    if (!d || isNaN(d.getTime())) return "N/A";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // TRUE PH PESO Unicode
  formatCurrency(value) {
    const peso = "\u20B1"; // ₱ symbol
    if (value === null || value === undefined || isNaN(value)) return `${peso}0.00`;
    const num = parseFloat(value);
    if (isNaN(num)) return `${peso}0.00`;
    return `${peso}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatQuantity(value) {
    if (!value && value !== 0) return "0";
    return parseFloat(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  getDateRange(data) {
    if (!data || data.length === 0) return { start: null, end: null };
    const dates = data
      .map(row => this.excelDateToJSDate(row.Date || row.Forecast_Date || row.date))
      .filter(d => d && !isNaN(d.getTime()))
      .sort((a, b) => a - b);
    if (dates.length === 0) return { start: null, end: null };
    return { start: dates[0], end: dates[dates.length - 1] };
  }

  calculateProductSummary(data) {
    if (!data || data.length === 0) return [];
    const productMap = new Map();

    data.forEach(row => {
      const productId = row['Product ID'] || row['Product_ID'] || row['product_id'];
      const productName = row['Product Name'] || row['Product_Name'] || row['product_name'];
      const category = row['Category'] || row['category'] || 'Uncategorized';
      const forecastQty = parseFloat(row['Forecast Qty'] || row['Forecast_Qty'] || row['forecast_qty'] || 0);
      const revenueEstimate = parseFloat(row['Revenue Estimate'] || row['Revenue_Estimate'] || row['revenue_estimate'] || 0);
      const avgUnitPrice = parseFloat(row['Avg Unit Price'] || row['Avg_Unit_Price'] || row['avg_unit_price'] || 0);
      const key = `${productId || 'unknown'}_${productName || 'unknown'}`;

      if (productMap.has(key)) {
        const existing = productMap.get(key);
        existing.totalQty += forecastQty;
        existing.totalRevenue += revenueEstimate;
        existing.occurrences += 1;
      } else {
        productMap.set(key, {
          productId: productId || 'N/A',
          productName: productName || 'Unknown',
          category,
          totalQty: forecastQty,
          totalRevenue: revenueEstimate,
          avgUnitPrice: avgUnitPrice || (forecastQty > 0 ? revenueEstimate / forecastQty : 0),
          occurrences: 1
        });
      }
    });

    return Array.from(productMap.values()).sort((a, b) => b.totalQty - a.totalQty);
  }

  async generateForecastReport(excelFilePath, outputPath) {
    try {
      if (!fs.existsSync(excelFilePath)) throw new Error(`Excel file not found: ${excelFilePath}`);
      const workbook = XLSX.readFile(excelFilePath);
      const sheetNames = workbook.SheetNames;
      const sheetsData = {};
      sheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
        sheetsData[sheetName] = jsonData;
      });

      const fileName = path.basename(excelFilePath);
      const fileStats = fs.statSync(excelFilePath);
      const generatedDate = fileStats.mtime;

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const docDefinition = this.buildPDFDocument(fileName, generatedDate, sheetsData);
      const printer = new PdfPrinter(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputPath);
        pdfDoc.pipe(writeStream);
        pdfDoc.end();
        writeStream.on("finish", () => resolve(outputPath));
        writeStream.on("error", err => reject(err));
        pdfDoc.on("error", err => reject(err));
      });

    } catch (err) {
      console.error("Error generating PDF report:", err);
      throw err;
    }
  }

  buildPDFDocument(fileName, generatedDate, sheetsData) {
    const sevenDayData = sheetsData["7d_forecast"] || [];
    const thirtyDayData = sheetsData["30d_forecast"] || [];
    const ninetyDayData = sheetsData["90d_forecast"] || [];
    const inventoryAlerts = sheetsData["inventory_alerts"] || [];

    const products7d = this.calculateProductSummary(sevenDayData);
    const products30d = this.calculateProductSummary(thirtyDayData);
    const products90d = this.calculateProductSummary(ninetyDayData);

    const range7d = this.getDateRange(sevenDayData);
    const range30d = this.getDateRange(thirtyDayData);
    const range90d = this.getDateRange(ninetyDayData);

    const buildProductSummaryTable = (products, title) => {
      if (!products || products.length === 0) return { text: "No products found", style: "noData" };

      const totalQty = products.reduce((sum, p) => sum + p.totalQty, 0);
      const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);

      return [
        { text: title, style: 'subSection', margin: [0, 12, 0, 6] },
        {
          text: `Total Products: ${products.length} | Total Quantity: ${this.formatQuantity(totalQty)} | Total Revenue: ${this.formatCurrency(totalRevenue)}`,
          style: 'summaryText',
          margin: [0, 0, 0, 8]
        },
        {
          table: {
            headerRows: 1,
            widths: [60, '*', 80, 70, 70, 80],
            body: [
              [
                { text: 'Product ID', style: 'tableHeader', bold: true },
                { text: 'Product Name', style: 'tableHeader', bold: true },
                { text: 'Category', style: 'tableHeader', bold: true },
                { text: 'Forecast Qty', style: 'tableHeader', bold: true, alignment: 'right' },
                { text: 'Avg Unit Price', style: 'tableHeader', bold: true, alignment: 'right' },
                { text: 'Revenue Estimate', style: 'tableHeader', bold: true, alignment: 'right' }
              ],
              ...products.map(product => [
                { text: product.productId || 'N/A', style: 'tableCell' },
                { text: product.productName || 'Unknown', style: 'tableCell' },
                { text: product.category || 'N/A', style: 'tableCell' },
                { text: this.formatQuantity(product.totalQty), style: 'tableCell', alignment: 'right' },
                { text: this.formatCurrency(product.avgUnitPrice), style: 'tableCell', alignment: 'right' },
                { text: this.formatCurrency(product.totalRevenue), style: 'tableCell', alignment: 'right' }
              ])
            ]
          },
          layout: this.getTableLayout()
        }
      ];
    };

    const buildDetailedTable = (data, maxRows = 15) => {
      if (!data || data.length === 0) return { text: "No data available", style: "noData" };

      const displayRows = data.slice(0, maxRows);

      return {
        table: {
          headerRows: 1,
          widths: [50, 60, '*', 70, 55, 60, 70],
          body: [
            [
              { text: 'Date', style: 'tableHeader', bold: true },
              { text: 'Product ID', style: 'tableHeader', bold: true },
              { text: 'Product Name', style: 'tableHeader', bold: true },
              { text: 'Category', style: 'tableHeader', bold: true },
              { text: 'Forecast Qty', style: 'tableHeader', bold: true, alignment: 'right' },
              { text: 'Avg Price', style: 'tableHeader', bold: true, alignment: 'right' },
              { text: 'Revenue', style: 'tableHeader', bold: true, alignment: 'right' }
            ],
            ...displayRows.map(row => {
              const date = this.excelDateToJSDate(row.Date || row.Forecast_Date || row.date);
              const productId = row['Product ID'] || row['Product_ID'] || row['product_id'] || 'N/A';
              const productName = row['Product Name'] || row['Product_Name'] || row['product_name'] || 'Unknown';
              const category = row['Category'] || row['category'] || 'N/A';
              const forecastQty = parseFloat(row['Forecast Qty'] || row['Forecast_Qty'] || row['forecast_qty'] || 0);
              const avgUnitPrice = parseFloat(row['Avg Unit Price'] || row['Avg_Unit_Price'] || row['avg_unit_price'] || 0);
              const revenueEstimate = parseFloat(row['Revenue Estimate'] || row['Revenue_Estimate'] || row['revenue_estimate'] || 0);

              return [
                { text: this.formatDate(date), style: 'tableCell' },
                { text: productId, style: 'tableCell' },
                { text: productName, style: 'tableCell' },
                { text: category, style: 'tableCell' },
                { text: this.formatQuantity(forecastQty), style: 'tableCell', alignment: 'right' },
                { text: this.formatCurrency(avgUnitPrice), style: 'tableCell', alignment: 'right' },
                { text: this.formatCurrency(revenueEstimate), style: 'tableCell', alignment: 'right' }
              ];
            })
          ]
        },
        layout: this.getTableLayout()
      };
    };

    // ----- FIXED INVENTORY ALERTS USING YOUR COLUMNS -----
    const buildInventoryTable = (data) => {
      if (!data || data.length === 0) return { text: "No inventory alerts", style: "noData" };

      return {
        table: {
          headerRows: 1,
          widths: [60, '*', 80, 70, 70, 70, 70, 60],
          body: [
            [
              { text: 'Product ID', style: 'tableHeader', bold: true },
              { text: 'Product Name', style: 'tableHeader', bold: true },
              { text: 'Category', style: 'tableHeader', bold: true },
              { text: '7d Forecast Qty', style: 'tableHeader', bold: true, alignment: 'right' },
              { text: '30d Forecast Qty', style: 'tableHeader', bold: true, alignment: 'right' },
              { text: 'Avg Daily Sales', style: 'tableHeader', bold: true, alignment: 'right' },
              { text: 'Risk Level', style: 'tableHeader', bold: true },
              { text: 'Action', style: 'tableHeader', bold: true }
            ],
            ...data.map(row => {
              const riskLevel = (row['Risk_Level'] || 'MEDIUM').toUpperCase();
              const riskColor = riskLevel === 'HIGH' ? '#dc2626' : riskLevel === 'MEDIUM' ? '#f59e0b' : '#16a34a';
              return [
                { text: row['Product_ID'] || 'N/A', style: 'tableCell' },
                { text: row['Product_Name'] || 'Unknown', style: 'tableCell' },
                { text: row['Category'] || 'N/A', style: 'tableCell' },
                { text: this.formatQuantity(row['7d_Forecast_Qty'] || 0), style: 'tableCell', alignment: 'right' },
                { text: this.formatQuantity(row['30d_Forecast_Qty'] || 0), style: 'tableCell', alignment: 'right' },
                { text: this.formatQuantity(row['Avg_Daily_Sales'] || 0), style: 'tableCell', alignment: 'right' },
                { text: riskLevel, style: 'tableCell', color: riskColor, bold: true },
                { text: row['Action'] || '-', style: 'tableCell' }
              ];
            })
          ]
        },
        layout: this.getTableLayout()
      };
    };

    const highRiskCount = inventoryAlerts.filter(a => (a.Risk_Level || 'MEDIUM').toUpperCase() === 'HIGH').length;

    const pages = [
      { text: 'Sales Forecast Report', style: 'title', alignment: 'center', margin: [0, 60, 0, 10] },
      { text: `Generated: ${this.formatDateTime(generatedDate)}`, style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 40] },
      { text: `Source: ${fileName}`, style: 'meta', alignment: 'center' },

      { text: '7-Day Forecast - Product Summary', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 6] },
      { text: `Period: ${this.formatDate(range7d.start)} to ${this.formatDate(range7d.end)}`, style: 'subtitle', margin: [0, 0, 0, 12] },
      ...buildProductSummaryTable(products7d, 'Products by Forecast Quantity'),
      { text: '7-Day Forecast - Daily Breakdown', style: 'subSection', margin: [0, 16, 0, 8] },
      buildDetailedTable(sevenDayData, 20),

      { text: '30-Day Forecast - Product Summary', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 6] },
      { text: `Period: ${this.formatDate(range30d.start)} to ${this.formatDate(range30d.end)}`, style: 'subtitle', margin: [0, 0, 0, 12] },
      ...buildProductSummaryTable(products30d, 'Products by Forecast Quantity'),
      { text: '30-Day Forecast - Daily Breakdown (First 20 Days)', style: 'subSection', margin: [0, 16, 0, 8] },
      buildDetailedTable(thirtyDayData, 20),

      { text: '90-Day Forecast - Product Summary', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 6] },
      { text: `Period: ${this.formatDate(range90d.start)} to ${this.formatDate(range90d.end)}`, style: 'subtitle', margin: [0, 0, 0, 12] },
      ...buildProductSummaryTable(products90d, 'Products by Forecast Quantity'),
      { text: '90-Day Forecast - Daily Breakdown (Sample)', style: 'subSection', margin: [0, 16, 0, 8] },
      buildDetailedTable(ninetyDayData, 15),

      ...(inventoryAlerts.length > 0 ? [
        { text: 'Inventory Alerts & Recommendations', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 6] },
        { text: `${highRiskCount} HIGH priority items require immediate attention.`, style: 'summaryText', margin: [0, 0, 0, 12], color: '#dc2626', bold: true },
        buildInventoryTable(inventoryAlerts)
      ] : [])
    ];

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [36, 54, 36, 48],
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      styles: {
        title: { fontSize: 24, bold: true, color: '#1e40af', margin: [0, 0, 0, 6] },
        subtitle: { fontSize: 11, color: '#0f172a' },
        meta: { fontSize: 9, color: '#475569' },
        sectionHeader: { fontSize: 16, bold: true, color: '#1e40af' },
        subSection: { fontSize: 12, bold: true, color: '#1e3a8a', margin: [0, 8, 0, 6] },
        tableHeader: { bold: true, fontSize: 9, color: '#1e3a8a', fillColor: '#cbd5e1' },
        tableCell: { fontSize: 8, color: '#0f172a' },
        noData: { fontSize: 9, italics: true, color: '#94a3b8', alignment: 'center', margin: [0, 10, 0, 10] },
        summaryText: { fontSize: 10, color: '#334155', margin: [0, 4, 0, 4] },
        footer: { fontSize: 7, color: '#64748b', alignment: 'center' }
      },
      header: (currentPage) => currentPage === 1 ? null : { text: 'Sales Forecast Report', style: 'footer', alignment: 'center', margin: [0, 12, 0, 0] },
      footer: (currentPage, pageCount) => ({
        text: `Generated: ${this.formatDateTime(generatedDate)} | Page ${currentPage} of ${pageCount}`,
        style: 'footer',
        margin: [36, 6, 36, 0]
      }),
      content: pages
    };
  }

  // helper for consistent table layout
  getTableLayout() {
    return {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#e2e8f0",
      vLineColor: () => "#e2e8f0",
      fillColor: (i) => (i === 0 ? '#cbd5e1' : (i % 2 === 0 ? '#f8fafc' : null)),
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4
    };
  }
}

module.exports = new PDFService();
