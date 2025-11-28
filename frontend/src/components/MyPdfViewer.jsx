import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css"; // Required for proper text layer

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function PdfViewer({ file }) {
  const [showViewer, setShowViewer] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const goToPrevPage = () => setPageNumber(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(numPages, prev + 1));

  return (
    <div style={{ margin: "20px 0" }}>
      <button onClick={() => setShowViewer(prev => !prev)}>
        {showViewer ? "Hide PDF" : "View PDF"}
      </button>

      {showViewer && (
        <div
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            maxHeight: "800px",
            overflowY: "auto",
          }}
        >
          <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} width={600} />
          </Document>

          {numPages && (
            <div style={{ marginTop: "10px" }}>
              <button onClick={goToPrevPage}>Previous</button>
              <span style={{ margin: "0 10px" }}>
                Page {pageNumber} of {numPages}
              </span>
              <button onClick={goToNextPage}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
