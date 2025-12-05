import React, { useState, useMemo, useEffect } from "react";
import "../css/Forecast.css";
import Swal from "sweetalert2";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  IoClose,
  IoDownload,
  IoEye,
  IoRefresh,
  IoArchive,
  IoCheckmarkCircle,
  IoCloseCircle,
} from "react-icons/io5";
import { FaEye, FaDownload, FaRedoAlt, FaArchive } from "react-icons/fa";
import { Tooltip as ReactTooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css"; // import CSS for styling

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

export default function Forecast() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [fileToArchive, setFileToArchive] = useState(null);
  const [activeTab, setActiveTab] = useState("current");
  const itemsPerPage = 5;
  const [refreshKey, setRefreshKey] = useState(0); // This is our magic trick
  // Persistent Downloaded Files

  // Format date beautifully for Philippines
  const formatDate = (dateString) => {
    return dayjs(dateString).tz("Asia/Manila").format("MMM D, YYYY - h:mm A");
  };
  const [downloadedFiles, setDownloadedFiles] = useState(() => {
    try {
      const saved = localStorage.getItem("forecastDownloadedFiles");
      if (!saved) return [];

      const items = JSON.parse(saved);

      // Optional: Auto-clean old downloads (keep last 90 days)
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const valid = items.filter(
        (item) => new Date(item.downloadedAt) > cutoff
      );

      // Update storage with cleaned list
      localStorage.setItem("forecastDownloadedFiles", JSON.stringify(valid));
      return valid;
    } catch (err) {
      console.error("Failed to load downloads from localStorage", err);
      return [];
    }
  });

  // Persistent Archived Files
  const [archivedFiles, setArchivedFiles] = useState(() => {
    try {
      const saved = localStorage.getItem("forecastArchivedFiles");
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.error("Failed to load archive from localStorage", err);
      return [];
    }
  });
  // Save to localStorage whenever downloadedFiles changes
  // Sync downloadedFiles to localStorage
  useEffect(() => {
    localStorage.setItem(
      "forecastDownloadedFiles",
      JSON.stringify(downloadedFiles)
    );
  }, [downloadedFiles]);

  // Sync archivedFiles to localStorage
  useEffect(() => {
    localStorage.setItem(
      "forecastArchivedFiles",
      JSON.stringify(archivedFiles)
    );
  }, [archivedFiles]);
  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Fetch forecast history
  const fetchHistory = async () => {
    try {
      setLoading(true);
      Swal.fire({
        title: "Loading...",
        text: "Fetching forecast history...",
        allowOutsideClick: false,
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
          text: "Please log in again.",
          confirmButtonColor: "#3085d6",
          confirmButtonText: "Go to Login",
        }).then(() => (window.location.href = "/login"));
        setForecasts([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ message: res.statusText }));
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Failed to Load Forecast History",
          text: data.message || "An error occurred",
          confirmButtonColor: "#d33",
        });
        setForecasts([]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setForecasts(
        data.sort(
          (a, b) =>
            new Date(b.dateISO || b.date) - new Date(a.dateISO || a.date)
        )
      );
      Swal.close();
      setLoading(false);
    } catch (err) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        html: `Unable to connect to server.<br/>${err.message}`,
        confirmButtonColor: "#d33",
      });
      setForecasts([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // View PDF
  const handleViewFile = async (file) => {
    try {
      if (!file?.fileName) return;
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);

      setViewingFile(file.fileName);
      setViewModalOpen(true);
      setPdfBlobUrl(null);

      Swal.fire({
        title: "Loading PDF...",
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await fetch(
        `http://localhost:5000/api/forecast/view/${encodeURIComponent(
          file.fileName
        )}`,
        { credentials: "include" }
      );
      Swal.close();

      if (!res.ok) {
        let message = res.headers
          .get("content-type")
          ?.includes("application/json")
          ? (await res.json()).message
          : await res.text();
        Swal.fire({
          icon: "error",
          title: "Error",
          text: message,
          confirmButtonColor: "#d33",
        });
        setViewModalOpen(false);
        return;
      }

      const blob = await res.blob();
      if (!blob.type.includes("pdf"))
        throw new Error(`Expected PDF but got ${blob.type}`);

      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#d33",
      });
      setViewModalOpen(false);
    }
  };

  // Reforecast
  const handleReforecast = async (file) => {
    const confirmResult = await Swal.fire({
      icon: "question",
      title: "Regenerate Forecast?",
      text: `This will regenerate forecast for ${
        file?.fileName || "all files"
      }.`,
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, Regenerate",
    });
    if (!confirmResult.isConfirmed) return;

    Swal.fire({
      title: "Generating Forecast...",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch(
        file
          ? `http://localhost:5000/api/forecast/regenerate/${file.id}`
          : "http://localhost:5000/api/forecast",
        { method: "POST", credentials: "include" }
      );
      Swal.close();
      if (!res.ok) throw new Error("Failed to regenerate forecast");
      Swal.fire({
        icon: "success",
        title: "Forecast Started",
        text: `${file?.fileName || "Forecast"} generation started.`,
        confirmButtonColor: "#28a745",
      });
      fetchHistory();
    } catch (err) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#d33",
      });
    }
  };

  // Download
  const handleDownloadFile = async (file) => {
    try {
      if (!file?.fileName) throw new Error("Invalid file");

      // Add to downloaded files (with timestamp)
      setDownloadedFiles((prev) => {
        // Avoid duplicates
        if (prev.some((f) => f.id === file.id)) return prev;

        const newEntry = {
          ...file,
          downloadedAt: new Date().toISOString(),
        };
        return [...prev, newEntry];
      });

      // ... rest of your existing download logic (fetch, blob, etc.)
      const res = await fetch(
        `http://localhost:5000/api/forecast/download/${encodeURIComponent(
          file.fileName
        )}`,
        { method: "GET", credentials: "include" }
      );

      if (!res.ok) {
        const text = await res.text();
        let errorMsg = "Failed to download";
        try {
          const data = JSON.parse(text);
          errorMsg = data.message || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      Swal.fire({
        icon: "success",
        title: "Downloaded!",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Download Failed",
        text: err.message,
      });
    }
  };

  // Remove from downloaded list + localStorage
  const handleRemoveDownload = (file) => {
    setDownloadedFiles((prev) => prev.filter((f) => f.id !== file.id));
    // localStorage will auto-update via useEffect above
  };

  // Archive / Unarchive
  const handleArchiveClick = (file) => {
    setFileToArchive(file);
    setArchiveModalOpen(true);
  };

  const handleArchiveConfirm = () => {
    if (!fileToArchive) return;

    setArchivedFiles((prev) => [
      ...prev,
      { ...fileToArchive, archivedAt: new Date().toISOString() },
    ]);
    setRefreshKey((prev) => prev + 1); // ← instant hide from main list

    Swal.fire(
      "Archived!",
      `${fileToArchive.fileName} moved to Archive`,
      "success"
    );

    setArchiveModalOpen(false);
    setFileToArchive(null);
  };
  const handleUnarchive = (file) => {
  // Remove from archive
  setArchivedFiles((prev) => prev.filter((f) => f.id !== file.id));

  // Force instant refresh of the main list
  setRefreshKey((prev) => prev + 1);

  // Switch to Forecasts tab automatically
  setActiveTab("current");

  // Beautiful success toast
  Swal.fire({
    icon: "success",
    title: "Restored!",
    text: `${file.fileName} is back in your Forecasts!`,
    toast: true,
    position: "top-end",
    timer: 3500,
    timerProgressBar: true,
    showConfirmButton: false,
    background: "#d4edda",
    color: "#155724",
  });
};
  // Filtering + Sorting + Pagination
  const filteredForecasts = useMemo(() => {
    let result = forecasts.filter(
      (f) => !archivedFiles.find((af) => af.id === f.id)
    );
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.horizon?.toLowerCase().includes(s) ||
          f.scope?.toLowerCase().includes(s) ||
          f.date?.toLowerCase().includes(s) ||
          f.fileName?.toLowerCase().includes(s)
      );
    }
    if (sortStatus !== "All")
      result = result.filter((f) => f.status === sortStatus);
    result.sort((a, b) =>
      sortOrder === "Newest First"
        ? new Date(b.dateISO || b.date) - new Date(a.dateISO || a.date)
        : new Date(a.dateISO || a.date) - new Date(b.dateISO || b.date)
    );
    return result;
  }, [search, sortStatus, sortOrder, forecasts, archivedFiles]);

  const totalPages = Math.ceil(filteredForecasts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentForecasts = filteredForecasts.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="table-wrapper">
      <h2 className="titled">Forecasts & Reports</h2>

      {loading && (
        <div
          className="table-container"
          style={{ textAlign: "center", padding: "48px" }}
        >
          <div style={{ fontSize: "16px", color: "#6b7280" }}>
            Loading forecast history...
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Tabs */}
          <div className="tabs">
            <button
              onClick={() => setActiveTab("current")}
              className={activeTab === "current" ? "active-tab" : ""}
            >
              Forecasts
            </button>
            <button
              onClick={() => setActiveTab("downloads")}
              className={activeTab === "downloads" ? "active-tab" : ""}
            >
              Downloads
              {downloadedFiles.length > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    padding: "2px 8px",
                    backgroundColor: "var(--accent-lighter)",
                    color: "white",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                >
                  {downloadedFiles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("archive")}
              className={activeTab === "archive" ? "active-tab" : ""}
            >
              Archive
              {archivedFiles.length > 0 && (
                <span
                  style={{
                    marginLeft: "8px",
                    padding: "2px 8px",
                    backgroundColor: "#6b7280",
                    color: "white",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                >
                  {archivedFiles.length}
                </span>
              )}
            </button>
          </div>

          {/* Current Forecasts Tab */}
          {activeTab === "current" && (
            <div key={refreshKey}>
              {" "}
              {/* ← THIS IS THE MAGIC */} {/* Toolbar */}
              <div className="table-toolbar">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                >
                  <option>Newest First</option>
                  <option>Oldest First</option>
                </select>

                <select
                  value={sortStatus}
                  onChange={(e) => setSortStatus(e.target.value)}
                >
                  <option>All</option>
                  <option>Completed</option>
                  <option>Failed</option>
                </select>

                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search forecasts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    className="btn-search"
                    onClick={() => setCurrentPage(1)}
                  >
                    Search
                  </button>
                </div>
              </div>
              {/* Table */}
              <div className="table-container">
                <table className="upload-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Horizon</th>
                      <th>Scope</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Accuracy</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentForecasts.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="no-data">
                          No forecasts found
                        </td>
                      </tr>
                    ) : (
                      currentForecasts.map((file) => (
                        <tr key={file.id}>
                          <td>{file.fileName}</td>
                          <td>{file.horizon}</td>
                          <td>{file.scope}</td>
                          <td>{formatDate(file.dateISO || file.date)}</td>{" "}
                          <td>
                            <span
                              className={`status ${
                                file.status === "Completed"
                                  ? "success"
                                  : "failed"
                              }`}
                            >
                              {file.status === "Completed" ? (
                                <IoCheckmarkCircle />
                              ) : (
                                <IoCloseCircle />
                              )}{" "}
                              {file.status}
                            </span>
                          </td>
                          <td>{file.accuracy}</td>
                          <td className="actions">
                            {file.fileName ? (
                              <>
                                {/* View PDF Button */}
                                <button
                                  className="btn-view"
                                  onClick={() => handleViewFile(file)}
                                  title="View PDF"
                                >
                                  <FaEye size={18} />
                                </button>

                                {/* Download Button */}
                                <button
                                  className="btn-download"
                                  onClick={() => handleDownloadFile(file)}
                                  title="Download File"
                                >
                                  <FaDownload size={18} />
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn-download"
                                disabled
                                title="Download Disabled"
                              >
                                <FaDownload size={18} />
                              </button>
                            )}

                            {/* Reforecast Button */}
                            <button
                              className="btn-reforecast"
                              onClick={() => handleReforecast(file)}
                              title="Reforecast"
                            >
                              <FaRedoAlt size={18} />
                            </button>

                            {/* Archive Button */}
                            <button
                              onClick={() => handleArchiveClick(file)}
                              className="btn-pdf"
                              title="Archive"
                            >
                              <FaArchive size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Downloads Tab */}
          {activeTab === "downloads" && (
            <div className="table-container" style={{ padding: "24px" }}>
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  marginBottom: "20px",
                }}
              >
                Downloaded Files ({downloadedFiles.length})
              </h3>
              {downloadedFiles.length === 0 ? (
                <p className="no-data">No downloaded files yet</p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {downloadedFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        padding: "16px",
                        border: "1px solid #c9d6e3",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#fff",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: "600",
                            fontSize: "15px",
                            color: "var(--accent)",
                          }}
                        >
                          {file.fileName}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            marginTop: "4px",
                          }}
                        >
                          Downloaded:{" "}
                          {new Date(file.downloadedAt).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleViewFile(file)}
                          className="btn-view"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleRemoveDownload(file)}
                          className="btn-pdf"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Archive Tab */}
          {activeTab === "archive" && (
            <div className="table-container" style={{ padding: "24px" }}>
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  marginBottom: "20px",
                }}
              >
                Archived Files ({archivedFiles.length})
              </h3>
              {archivedFiles.length === 0 ? (
                <p className="no-data">No archived files</p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {archivedFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        padding: "16px",
                        border: "1px solid #c9d6e3",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#f9fbfd",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: "600",
                            fontSize: "15px",
                            color: "var(--accent)",
                          }}
                        >
                          {file.fileName}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            marginTop: "4px",
                          }}
                        >
                          Archived: {new Date(file.archivedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnarchive(file)}
                        className="btn-download"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Archive Confirmation Modal */}
      {archiveModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setArchiveModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive Forecast</h3>
              <button
                className="modal-close"
                onClick={() => setArchiveModalOpen(false)}
              >
                <IoClose />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "#6b7280", marginBottom: "24px" }}>
                Are you sure you want to archive{" "}
                <strong>{fileToArchive?.fileName}</strong>? You can restore it
                later from the Archive tab.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setArchiveModalOpen(false)}
                  style={{
                    padding: "10px 20px",
                    border: "1px solid #c9d6e3",
                    backgroundColor: "white",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
                <button onClick={handleArchiveConfirm} className="btn-pdf">
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setViewModalOpen(false);
            if (pdfBlobUrl) {
              URL.revokeObjectURL(pdfBlobUrl);
              setPdfBlobUrl(null);
            }
          }}
        >
          <div
            className="modal-content modal-content-pdf"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{viewingFile}</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setViewModalOpen(false);
                  if (pdfBlobUrl) {
                    URL.revokeObjectURL(pdfBlobUrl);
                    setPdfBlobUrl(null);
                  }
                }}
              >
                <IoClose />
              </button>
            </div>
            <div className="modal-body modal-body-pdf">
              {pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  style={{
                    width: "100%",
                    height: "75vh",
                    border: "none",
                  }}
                  title="Forecast PDF"
                />
              ) : (
                <div className="no-data">Loading preview...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
