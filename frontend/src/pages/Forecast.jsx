import React, { useState, useMemo, useEffect, useCallback } from "react";
import "../css/Forecast.css";
import Swal from "sweetalert2";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  IoClose,
  IoCheckmarkCircle,
  IoCloseCircle,
} from "react-icons/io5";
import { FaEye, FaDownload, FaRedoAlt, FaArchive } from "react-icons/fa";
import { useNotifications } from "../components/Notifications";
const API = import.meta.env.VITE_API_URL;

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

// ==================== CONSTANTS ====================
const ITEMS_PER_PAGE = 5;
const FORECAST_API_BASE = "http://localhost:5000/api/forecast";
const STORAGE_KEYS = {
  DOWNLOADS: "forecastDownloadedFiles",
  ARCHIVE: "forecastArchivedFiles",
};
const ARCHIVE_CUTOFF_DAYS = 90;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Format date to Manila timezone
 */
const formatDate = (dateString) => {
  return dayjs(dateString)
    .tz("Asia/Manila")
    .format("MMM D, YYYY - h:mm A");
};

/**
 * Safe localStorage getter with fallback
 */
const getFromLocalStorage = (key, defaultValue = []) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;

    const items = JSON.parse(saved);
    if (!Array.isArray(items)) return defaultValue;

    // Auto-clean old downloads (keep last 90 days)
    if (key === STORAGE_KEYS.DOWNLOADS) {
      const cutoff = Date.now() - ARCHIVE_CUTOFF_DAYS * 24 * 60 * 60 * 1000;
      const valid = items.filter(
        (item) => new Date(item.downloadedAt) > cutoff
      );
      localStorage.setItem(key, JSON.stringify(valid));
      return valid;
    }

    return items;
  } catch (err) {
    console.error(`Failed to load ${key} from localStorage:`, err);
    return defaultValue;
  }
};

/**
 * Safe localStorage setter
 */
const setToLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to save ${key} to localStorage:`, err);
  }
};

// ==================== COMPONENTS ====================

/**
 * Loading State Component
 */
const LoadingState = () => (
  <div
    className="table-container"
    style={{ textAlign: "center", padding: "48px" }}
  >
    <div style={{ fontSize: "16px", color: "#6b7280" }}>
      Loading forecast history...
    </div>
  </div>
);

/**
 * Toolbar Component
 */
const ForecastToolbar = ({ search, setSearch, sortOrder, setSortOrder, sortStatus, setSortStatus, setCurrentPage }) => (
  <div className="table-toolbar">
    <select
      value={sortOrder}
      onChange={(e) => setSortOrder(e.target.value)}
      aria-label="Sort order"
    >
      <option>Newest First</option>
      <option>Oldest First</option>
    </select>

    <select
      value={sortStatus}
      onChange={(e) => setSortStatus(e.target.value)}
      aria-label="Filter by status"
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
        aria-label="Search forecasts"
      />
      <button
        className="btn-search"
        onClick={() => setCurrentPage(1)}
        aria-label="Search button"
      >
        Search
      </button>
    </div>
  </div>
);

/**
 * Forecast Table Row Component
 */
const ForecastTableRow = ({ file, onView, onDownload, onReforecast, onArchive }) => (
  <tr key={file.id}>
    <td>{file.fileName}</td>
    <td>{file.horizon}</td>
    <td>{file.scope}</td>
    <td>{formatDate(file.dateISO || file.date)}</td>
    <td>
      <span className={`status ${file.status === "Completed" ? "success" : "failed"}`}>
        {file.status === "Completed" ? (
          <IoCheckmarkCircle />
        ) : (
          <IoCloseCircle />
        )}{" "}
        {file.status}
      </span>
    </td>
    <td className="actions">
      {file.fileName ? (
        <>
          <button
            className="btn-view"
            onClick={() => onView(file)}
            title="View PDF"
            aria-label={`View ${file.fileName}`}
          >
            <FaEye size={18} />
          </button>

          <button
            className="btn-download"
            onClick={() => onDownload(file)}
            title="Download File"
            aria-label={`Download ${file.fileName}`}
          >
            <FaDownload size={18} />
          </button>
        </>
      ) : (
        <button
          className="btn-download"
          disabled
          title="Download Disabled"
          aria-label="Download disabled"
        >
          <FaDownload size={18} />
        </button>
      )}

      <button
        className="btn-reforecast"
        onClick={() => onReforecast(file)}
        title="Reforecast"
        aria-label={`Reforecast ${file.fileName}`}
      >
        <FaRedoAlt size={18} />
      </button>

      <button
        onClick={() => onArchive(file)}
        className="btn-pdf"
        title="Archive"
        aria-label={`Archive ${file.fileName}`}
      >
        <FaArchive size={18} />
      </button>
    </td>
  </tr>
);

/**
 * Forecast Table Component
 */
const ForecastTable = ({ forecasts, onView, onDownload, onReforecast, onArchive }) => (
  <div className="table-container">
    <table className="upload-table">
      <thead>
        <tr>
          <th>File Name</th>
          <th>Horizon</th>
          <th>Scope</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {forecasts.length === 0 ? (
          <tr>
            <td colSpan="7" className="no-data">
              No forecasts found
            </td>
          </tr>
        ) : (
          forecasts.map((file) => (
            <ForecastTableRow
              key={file.id}
              file={file}
              onView={onView}
              onDownload={onDownload}
              onReforecast={onReforecast}
              onArchive={onArchive}
            />
          ))
        )}
      </tbody>
    </table>
  </div>
);

/**
 * Pagination Component
 */
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        Previous
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
};

/**
 * Downloaded Files List Component
 */
const DownloadsTab = ({ files, onView, onRemove }) => (
  <div className="table-container" style={{ padding: "24px" }}>
    <h3
      style={{
        fontSize: "20px",
        fontWeight: "600",
        marginBottom: "20px",
      }}
    >
      Downloaded Files ({files.length})
    </h3>
    {files.length === 0 ? (
      <p className="no-data">No downloaded files yet</p>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {files.map((file) => (
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
                onClick={() => onView(file)}
                className="btn-view"
                aria-label={`View ${file.fileName}`}
              >
                View
              </button>
              <button
                onClick={() => onRemove(file)}
                className="btn-pdf"
                aria-label={`Remove ${file.fileName}`}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * Archive Tab Component
 */
const ArchiveTab = ({ files, onRestore }) => (
  <div className="table-container" style={{ padding: "24px" }}>
    <h3
      style={{
        fontSize: "20px",
        fontWeight: "600",
        marginBottom: "20px",
      }}
    >
      Archived Files ({files.length})
    </h3>
    {files.length === 0 ? (
      <p className="no-data">No archived files</p>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {files.map((file) => (
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
              onClick={() => onRestore(file)}
              className="btn-download"
              aria-label={`Restore ${file.fileName}`}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * Archive Confirmation Modal Component
 */
const ArchiveModal = ({ isOpen, file, onConfirm, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-modal-title"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="archive-modal-title">Archive Forecast</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <IoClose />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: "#6b7280", marginBottom: "24px" }}>
            Are you sure you want to archive{" "}
            <strong>{file?.fileName}</strong>? You can restore it
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
              onClick={onClose}
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
            <button onClick={onConfirm} className="btn-pdf">
              Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * PDF Viewer Modal Component
 */
const PDFModal = ({ isOpen, fileName, pdfBlobUrl, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
    >
      <div
        className="modal-content modal-content-pdf"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="pdf-modal-title">{fileName}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
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
              title={`${fileName} PDF Viewer`}
            />
          ) : (
            <div className="no-data">Loading preview...</div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Tabs Navigation Component
 */
const TabsNavigation = ({ activeTab, setActiveTab, downloadCount, archiveCount }) => (
  <div className="tabs">
    <button
      onClick={() => setActiveTab("current")}
      className={activeTab === "current" ? "active-tab" : ""}
      aria-selected={activeTab === "current"}
    >
      Forecasts
    </button>
    <button
      onClick={() => setActiveTab("downloads")}
      className={activeTab === "downloads" ? "active-tab" : ""}
      aria-selected={activeTab === "downloads"}
    >
      Downloads
      {downloadCount > 0 && (
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
          {downloadCount}
        </span>
      )}
    </button>
    <button
      onClick={() => setActiveTab("archive")}
      className={activeTab === "archive" ? "active-tab" : ""}
      aria-selected={activeTab === "archive"}
    >
      Archive
      {archiveCount > 0 && (
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
          {archiveCount}
        </span>
      )}
    </button>
  </div>
);

// ==================== MAIN COMPONENT ====================

export default function Forecast() {
  // State Management
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("current");
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal States
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [fileToArchive, setFileToArchive] = useState(null);

  // Storage States
  const [downloadedFiles, setDownloadedFiles] = useState(() =>
    getFromLocalStorage(STORAGE_KEYS.DOWNLOADS)
  );
  const [archivedFiles, setArchivedFiles] = useState(() =>
    getFromLocalStorage(STORAGE_KEYS.ARCHIVE)
  );

  // Notifications Hook
  const { showSuccess, showError, showInfo } = useNotifications();

  // ==================== SIDE EFFECTS ====================

  // Sync to localStorage whenever state changes
  useEffect(() => {
    setToLocalStorage(STORAGE_KEYS.DOWNLOADS, downloadedFiles);
  }, [downloadedFiles]);

  useEffect(() => {
    setToLocalStorage(STORAGE_KEYS.ARCHIVE, archivedFiles);
  }, [archivedFiles]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // ==================== CALLBACKS ====================

  /**
   * Fetch forecast history from API
   */
  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      Swal.fire({
        title: "Loading...",
        text: "Fetching forecast history...",
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await fetch(`${FORECAST_API_BASE}/history`, {
        credentials: "include",
      });

      Swal.close();

      if (res.status === 401) {
        showError("Session expired. Please log in again.");
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: res.statusText }));
        showError(data.message || "Failed to load forecast history");
        setForecasts([]);
        return;
      }

      const data = await res.json();
      setForecasts(
        data.sort(
          (a, b) =>
            new Date(b.dateISO || b.date) - new Date(a.dateISO || a.date)
        )
      );
      showSuccess("Forecast history loaded");
    } catch (err) {
      showError(`Connection error: ${err.message}`);
      setForecasts([]);
    } finally {
      setLoading(false);
    }
  }, [showError, showSuccess]);

  /**
   * View PDF file
   */
  const handleViewFile = useCallback(
    async (file) => {
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
          `${FORECAST_API_BASE}/view/${encodeURIComponent(file.fileName)}`,
          { credentials: "include" }
        );

        Swal.close();

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: "Failed to load PDF" }));
          showError(errorData.message || "Failed to load PDF");
          setViewModalOpen(false);
          return;
        }

        const blob = await res.blob();
        if (!blob.type.includes("pdf")) {
          showError(`Expected PDF but got ${blob.type}`);
          setViewModalOpen(false);
          return;
        }

        setPdfBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        Swal.close();
        showError(err.message);
        setViewModalOpen(false);
      }
    },
    [pdfBlobUrl, showError]
  );

  /**
   * Reforecast
   */
  const handleReforecast = useCallback(
    async (file) => {
      const confirmed = await Swal.fire({
        icon: "question",
        title: "Regenerate Forecast?",
        text: `This will regenerate forecast for ${file?.fileName || "all files"}.`,
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes, Regenerate",
      });

      if (!confirmed.isConfirmed) return;

      Swal.fire({
        title: "Generating Forecast...",
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });

      try {
        const url = file
          ? `${FORECAST_API_BASE}/regenerate/${file.id}`
          : FORECAST_API_BASE;

        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
        });

        Swal.close();

        if (!res.ok) {
          showError("Failed to regenerate forecast");
          return;
        }

        showSuccess(`${file?.fileName || "Forecast"} generation started`);
        fetchHistory();
      } catch (err) {
        Swal.close();
        showError(err.message);
      }
    },
    [fetchHistory, showError, showSuccess]
  );

  /**
   * Download file
   */
  const handleDownloadFile = useCallback(
    async (file) => {
      try {
        if (!file?.fileName) throw new Error("Invalid file");

        // Add to downloaded files
        setDownloadedFiles((prev) => {
          if (prev.some((f) => f.id === file.id)) return prev;
          return [
            ...prev,
            { ...file, downloadedAt: new Date().toISOString() },
          ];
        });

        const res = await fetch(
          `${FORECAST_API_BASE}/download/${encodeURIComponent(file.fileName)}`,
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

        showSuccess("File downloaded successfully");
      } catch (err) {
        showError(`Download failed: ${err.message}`);
      }
    },
    [showError, showSuccess]
  );

  /**
   * Remove from downloaded list
   */
  const handleRemoveDownload = useCallback((file) => {
    setDownloadedFiles((prev) => prev.filter((f) => f.id !== file.id));
    showInfo("Download removed from list");
  }, [showInfo]);

  /**
   * Archive file
   */
  const handleArchiveClick = useCallback((file) => {
    setFileToArchive(file);
    setArchiveModalOpen(true);
  }, []);

  /**
   * Confirm archive
   */
  const handleArchiveConfirm = useCallback(() => {
    if (!fileToArchive) return;

    setArchivedFiles((prev) => [
      ...prev,
      { ...fileToArchive, archivedAt: new Date().toISOString() },
    ]);
    setRefreshKey((prev) => prev + 1);

    showSuccess(`${fileToArchive.fileName} moved to Archive`);
    setArchiveModalOpen(false);
    setFileToArchive(null);
  }, [fileToArchive, showSuccess]);

  /**
   * Restore from archive
   */
  const handleUnarchive = useCallback((file) => {
    setArchivedFiles((prev) => prev.filter((f) => f.id !== file.id));
    setRefreshKey((prev) => prev + 1);
    setActiveTab("current");

    showSuccess(`${file.fileName} restored to Forecasts`);
  }, [showSuccess]);

  // ==================== FILTERING & PAGINATION ====================

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

    if (sortStatus !== "All") {
      result = result.filter((f) => f.status === sortStatus);
    }

    result.sort((a, b) =>
      sortOrder === "Newest First"
        ? new Date(b.dateISO || b.date) - new Date(a.dateISO || a.date)
        : new Date(a.dateISO || a.date) - new Date(b.dateISO || b.date)
    );

    return result;
  }, [search, sortStatus, sortOrder, forecasts, archivedFiles]);

  const totalPages = Math.ceil(filteredForecasts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentForecasts = filteredForecasts.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  // ==================== FETCH ON MOUNT ====================

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ==================== RENDER ====================

  return (
    <div className="table-wrapper">
      <h2 className="titled">Forecasts & Reports</h2>

      {loading && <LoadingState />}

      {!loading && (
        <>
          <TabsNavigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            downloadCount={downloadedFiles.length}
            archiveCount={archivedFiles.length}
          />

          {/* Current Forecasts Tab */}
          {activeTab === "current" && (
            <div key={refreshKey}>
              <ForecastToolbar
                search={search}
                setSearch={setSearch}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                sortStatus={sortStatus}
                setSortStatus={setSortStatus}
                setCurrentPage={setCurrentPage}
              />

              <ForecastTable
                forecasts={currentForecasts}
                onView={handleViewFile}
                onDownload={handleDownloadFile}
                onReforecast={handleReforecast}
                onArchive={handleArchiveClick}
              />

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  if (page >= 1 && page <= totalPages) setCurrentPage(page);
                }}
              />
            </div>
          )}

          {/* Downloads Tab */}
          {activeTab === "downloads" && (
            <DownloadsTab
              files={downloadedFiles}
              onView={handleViewFile}
              onRemove={handleRemoveDownload}
            />
          )}

          {/* Archiqve Tab */}
          {activeTab === "archive" && (
            <ArchiveTab
              files={archivedFiles}
              onRestore={handleUnarchive}
            />
          )}
        </>
      )}

      {/* Modals */}
      <ArchiveModal
        isOpen={archiveModalOpen}
        file={fileToArchive}
        onConfirm={handleArchiveConfirm}
        onClose={() => setArchiveModalOpen(false)}
      />

      <PDFModal
        isOpen={viewModalOpen}
        fileName={viewingFile}
        pdfBlobUrl={pdfBlobUrl}
        onClose={() => {
          setViewModalOpen(false);
          if (pdfBlobUrl) {
            URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
          }
        }}
      />
    </div>
  );
}