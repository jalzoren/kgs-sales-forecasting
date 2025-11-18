const path = require('path');
const pdfService = require('./services/pdfService');

async function testPDF() {
  try {
    const excelFilePath = path.join(__dirname, 'files\\forecastData\\user_5\\forecast_week_20251110_to_20251116.xlsx'); // path to your test Excel
    const outputPath = path.join(__dirname, 'forecast_report.pdf');  // path for generated PDF

    const result = await pdfService.generateForecastReport(excelFilePath, outputPath);

    console.log('PDF successfully generated at:', result);
  } catch (err) {
    console.error('Error generating PDF:', err);
  }
}

testPDF();
