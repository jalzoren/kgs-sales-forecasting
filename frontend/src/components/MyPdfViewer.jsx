import React, { useState } from 'react';
import { Document as PDFViewerDoc, Page, pdfjs } from 'react-pdf';
import { Document as PDFDocument, Page as PDFPage, Text, StyleSheet, pdf, PDFDownloadLink } from '@react-pdf/renderer';

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

// PDF content for download and viewing
const MyDocumentContent = () => (
  <PDFDocument>
    <PDFPage style={{ flexDirection: 'column', backgroundColor: '#f2f2f2', padding: 20 }}>
      <Text style={{ margin: 10, padding: 10, fontSize: 14 }}>Hello, this is your PDF!</Text>
      <Text style={{ margin: 10, padding: 10, fontSize: 14 }}>You can add more text, tables, charts, etc.</Text>
    </PDFPage>
  </PDFDocument>
);

function MyPdfViewer() {
  const [showViewer, setShowViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  const handleViewPdf = async () => {
    // Generate PDF blob
    const blob = await pdf(<MyDocumentContent />).toBlob();
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    setShowViewer(true);
    setPageNumber(1);
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <button onClick={handleViewPdf} style={{ marginBottom: '10px' }}>
        View PDF
      </button>

      <div style={{ marginBottom: '10px' }}>
        <PDFDownloadLink document={<MyDocumentContent />} fileName="example.pdf">
          {({ loading }) => (loading ? 'Preparing PDF...' : 'Download PDF')}
        </PDFDownloadLink>
      </div>

      {showViewer && pdfBlobUrl && (
        <div style={{ border: '1px solid #ccc', padding: '10px', maxHeight: '800px', overflowY: 'scroll' }}>
          <PDFViewerDoc file={pdfBlobUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} width={600} />
          </PDFViewerDoc>

          {numPages && (
            <div style={{ marginTop: '10px' }}>
              <button onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}>Previous</button>
              <span style={{ margin: '0 10px' }}>
                Page {pageNumber} of {numPages}
              </span>
              <button onClick={() => setPageNumber(prev => Math.min(numPages, prev + 1))}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MyPdfViewer;
