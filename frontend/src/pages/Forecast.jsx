import React, { useState, useMemo, useEffect } from "react";
import "../css/Forecast.css";
import Swal from "sweetalert2";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { IoClose } from "react-icons/io5";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

export default function Forecast() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Cleanup blob URL when component unmounts or modal closes
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // ======================================================
  // ✅ Fetch forecast history from backend
  // ======================================================
  const fetchHistory = async () => {
    try {
      setLoading(true);
      
      Swal.fire({
        title: "Loading...",
        text: "Fetching forecast history...",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
      
      const res = await fetch("http://localhost:5000/api/forecast/history", {
        credentials: "include",
      });
      
      if (res.status === 401) {
        Swal.close();
        Swal.fire({
          icon: "warning",
          title: "Session Expired",
          text: "Your session has expired. Please log in again.",
          confirmButtonColor: "#3085d6",
          confirmButtonText: "Go to Login",
        }).then(() => {
          window.location.href = "/login";
        });
        setForecasts([]);
        setLoading(false);
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        console.error("Failed to fetch forecast history:", res.status, errorData);
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Failed to Load Forecast History",
          text: errorData.message || res.statusText || "An error occurred while loading forecast history.",
          confirmButtonColor: "#d33",
        });
        setForecasts([]);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      console.log("📊 Received forecast data:", data);
      
      const sorted = data.sort((a, b) => {
        const dateA = a.dateISO ? new Date(a.dateISO) : new Date(a.date);
        const dateB = b.dateISO ? new Date(b.dateISO) : new Date(b.date);
        return dateB - dateA;
      });
      setForecasts(sorted);
      Swal.close();
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch forecast history:", err);
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        html: `Unable to connect to the server.<br/><br/>${err.message}<br/><br/><small>Please make sure the backend server is running on port 5000.</small>`,
        confirmButtonColor: "#d33",
      });
      setForecasts([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // ======================================================
  // 👁️ Handle View PDF File - Download as Blob
  // ======================================================
  const handleViewFile = async (fileName) => {
    try {
      // Cleanup previous blob URL
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
        setPdfBlobUrl(null);
      }
      
      setViewingFile(fileName);
      setViewModalOpen(true);
      setPdfBlob(null);
      
      Swal.fire({
        title: "Loading PDF...",
        text: "Preparing forecast report...",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
      
      const encodedFileName = encodeURIComponent(fileName);
      const pdfViewUrl = `http://localhost:5000/api/forecast/view/${encodedFileName}`;
      
      console.log(`📄 Fetching PDF: ${pdfViewUrl}`);
      
      // Fetch PDF as blob with credentials
      const response = await fetch(pdfViewUrl, {
        credentials: "include",
        method: "GET",
      });
      
      Swal.close();
      
      if (response.status === 401) {
        Swal.fire({
          icon: "warning",
          title: "Session Expired",
          text: "Your session has expired. Please log in again.",
          confirmButtonColor: "#3085d6",
          confirmButtonText: "Go to Login",
        }).then(() => {
          window.location.href = "/login";
        });
        setViewModalOpen(false);
        return;
      }
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Failed to load forecast PDF.";
        
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error("❌ PDF fetch error:", errorData);
        } else {
          const errorText = await response.text();
          console.error("❌ PDF fetch error:", errorText);
          errorMessage = errorText || errorMessage;
        }
        
        Swal.fire({
          icon: "error",
          title: "Failed to Load PDF",
          text: errorMessage,
          confirmButtonColor: "#d33",
        });
        setViewModalOpen(false);
        return;
      }
      
      // Get the PDF as a blob
      const blob = await response.blob();
      
      // Verify it's a PDF
      if (!blob.type.includes("pdf")) {
        console.error("❌ Response is not a PDF:", blob.type);
        Swal.fire({
          icon: "error",
          title: "Invalid File Type",
          text: `Expected PDF but received: ${blob.type}`,
          confirmButtonColor: "#d33",
        });
        setViewModalOpen(false);
        return;
      }
      
      console.log(`✅ PDF blob received: ${(blob.size / 1024).toFixed(2)} KB`);
      
      // Create blob URL for the PDF viewer
      const blobUrl = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setPdfBlobUrl(blobUrl);
      
      console.log(`🔍 Opening PDF view for: ${fileName}`);
    } catch (err) {
      console.error("❌ Failed to view PDF:", err);
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text: `Failed to load PDF: ${err.message}`,
        confirmButtonColor: "#d33",
      });
      setViewModalOpen(false);
    }
  };

  // ======================================================
  // 🔁 Handle Reforecast
  // ======================================================
  const handleReforecast = async () => {
    const confirmResult = await Swal.fire({
      icon: "question",
      title: "Generate New Forecast?",
      text: "This will generate a new forecast for all horizons (Next Week, Next 30 days, Next 90 days). This may take a few minutes.",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, Generate",
      cancelButtonText: "Cancel",
    });

    if (!confirmResult.isConfirmed) {
      return;
    }

    Swal.fire({
      title: "Generating Forecast...",
      text: "Please wait while the forecast is being generated for all horizons.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch("http://localhost:5000/api/forecast", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.status === 401) {
        Swal.close();
        Swal.fire({
          icon: "warning",
          title: "Session Expired",
          text: "Your session has expired. Please log in again.",
          confirmButtonColor: "#3085d6",
          confirmButtonText: "Go to Login",
        }).then(() => {
          window.location.href = "/login";
        });
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Reforecast Failed",
          text: errorData.message || "Failed to start forecast generation. Please try again.",
          confirmButtonColor: "#d33",
        });
        return;
      }

      Swal.close();
      Swal.fire({
        icon: "success",
        title: "Forecast Generation Started",
        text: "Your forecast is being generated for all horizons (Next Week, Next 30 days, Next 90 days). It will appear in the history when complete.",
        confirmButtonColor: "#28a745",
        timer: 3000,
        timerProgressBar: true,
      });

      setTimeout(() => {
        fetchHistory();
      }, 2000);
    } catch (err) {
      console.error(err);
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: `Failed to connect to server: ${err.message}. Please make sure the backend server is running.`,
        confirmButtonColor: "#d33",
      });
    }
  };

  // ======================================================
  // 🔍 Filtering + Sorting + Pagination
  // ======================================================
  const filteredForecasts = useMemo(() => {
    let result = [...forecasts];

    if (search.trim() !== "") {
      const s = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.horizon.toLowerCase().includes(s) ||
          f.scope.toLowerCase().includes(s) ||
          f.date.toLowerCase().includes(s) ||
          (f.fileName && f.fileName.toLowerCase().includes(s))
      );
    }

    if (sortStatus !== "All") {
      result = result.filter((f) => f.status === sortStatus);
    }

    result.sort((a, b) => {
      const dA = a.dateISO ? new Date(a.dateISO) : new Date(a.date);
      const dB = b.dateISO ? new Date(b.dateISO) : new Date(b.date);
      return sortOrder === "Newest First" ? dB - dA : dA - dB;
    });

    return result;
  }, [search, sortStatus, sortOrder, forecasts]);

  const totalPages = Math.ceil(filteredForecasts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentForecasts = filteredForecasts.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // ======================================================
  // 🔹 Render
  // ======================================================
  return (
    <div>
      <h2 className="titled">Forecast History</h2>

      <div className="table-wrapper">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search forecasts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-search" onClick={() => setCurrentPage(1)}>
              Search
            </button>
          </div>

          <select value={sortStatus} onChange={(e) => setSortStatus(e.target.value)}>
            <option>All</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option>Newest First</option>
            <option>Oldest First</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="upload-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Filename</th>
                <th>Forecast Horizon</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Accuracy</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "1rem" }}>
                    Loading...
                  </td>
                </tr>
              ) : currentForecasts.length > 0 ? (
                currentForecasts.map((f, idx) => (
                  <tr key={f.id || idx}>
                    <td>
                      {f.dateISO 
                        ? dayjs(f.dateISO).tz().format("MMMM D, YYYY • h:mm A")
                        : f.date 
                        ? dayjs(f.date).tz().format("MMMM D, YYYY • h:mm A")
                        : "—"}
                    </td>
                    <td style={{ fontSize: "0.9em", color: "#666" }}>
                      {f.fileName || f.filePath?.split("/").pop() || "—"}
                    </td>
                    <td>
                      {f.horizons && Array.isArray(f.horizons) && f.horizons.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {f.horizons.map((h, hIdx) => (
                            <span key={hIdx} style={{ fontSize: "0.9em" }}>
                              {h.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        f.horizon || "N/A"
                      )}
                    </td>
                    <td>{f.scope}</td>
                    <td>
                      <span className={`status ${f.status === "Completed" ? "success" : "failed"}`}>
                        {f.status}
                      </span>
                    </td>
                    <td>{f.accuracy || "N/A"}</td>
                    <td className="actions">
                      {f.filePath ? (
                        <>
                          <button 
                            className="btn-view"
                            onClick={() => handleViewFile(f.fileName)}
                          >
                            View
                          </button>
                          <a
                            href={`http://localhost:5000/${f.filePath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <button className="btn-download">Download</button>
                          </a>
                        </>
                      ) : (
                        <button className="btn-download" disabled>
                          Download
                        </button>
                      )}
                      <button
                        className="btn-reforecast"
                        onClick={() => handleReforecast()}
                      >
                        Reforecast
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "1rem" }}>
                    No forecasts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
            ← Previous
          </button>

          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => goToPage(i + 1)}
              className={currentPage === i + 1 ? "active" : ""}
            >
              {i + 1}
            </button>
          ))}

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Next →
          </button>
        </div>
      </div>

      {/* View PDF Modal */}
      {viewModalOpen && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => {
            setViewModalOpen(false);
            if (pdfBlobUrl) {
              URL.revokeObjectURL(pdfBlobUrl);
              setPdfBlobUrl(null);
            }
          }}
        >
          <div 
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "1200px",
              height: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h3 style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#1a1a1a",
                margin: 0,
              }}>
                Forecast Report: {viewingFile || "Loading..."}
              </h3>
              <button 
                style={{
                  padding: "8px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  color: "#6b7280",
                  transition: "all 0.2s",
                }}
                onClick={() => {
                  setViewModalOpen(false);
                  if (pdfBlobUrl) {
                    URL.revokeObjectURL(pdfBlobUrl);
                    setPdfBlobUrl(null);
                  }
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <IoClose />
              </button>
            </div>
            
            <div style={{
              flex: 1,
              overflow: "hidden",
              padding: "16px",
            }}>
              {pdfBlobUrl ? (
                <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                  <div style={{ height: "100%", width: "100%" }}>
                    <Viewer
                      fileUrl={pdfBlobUrl}
                      plugins={[defaultLayoutPluginInstance]}
                      onDocumentLoad={(e) => {
                        console.log("✅ PDF loaded successfully:", e.doc.numPages, "pages");
                      }}
                      onLoadError={(error) => {
                        console.error("❌ PDF load error:", error);
                        Swal.fire({
                          icon: "error",
                          title: "Failed to Load PDF",
                          text: "The PDF could not be loaded. Please try again or check if the forecast file exists.",
                          confirmButtonColor: "#d33",
                        });
                        setViewModalOpen(false);
                      }}
                    />
                  </div>
                </Worker>
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#6b7280",
                }}>
                  <div style={{ fontSize: "16px", fontWeight: "500" }}>Loading PDF...</div>
                  <div style={{ fontSize: "14px", marginTop: "8px" }}>
                    If this is the first time viewing, the PDF is being generated...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}