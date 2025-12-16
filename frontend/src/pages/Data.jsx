// frontend/src/pages/Data.jsx
import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Swal from "sweetalert2";
import { useNotifications } from "../components/Notifications";
import SessionManager from "../services/sessionManager";
import {
  FaBell,
  FaCog,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
} from "react-icons/fa";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

const API_BASE = import.meta.env.VITE_API_URL.replace(/\/$/, "");const API = `${API_BASE}/api`;

export default function UploadBox() {
  const {
    showInfo,
    showSuccess,
    showError,
    showProgress,
    updateNotification,
    removeNotification,
  } = useNotifications();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [uploadStatusMap, setUploadStatusMap] = useState({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchUploads = async (showLoading = false) => {
    if (showLoading && isInitialLoad) {
      Swal.fire({
        title: "Loading...",
        text: "Fetching upload history...",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
    }

    try {
     const url = showLoading
  ? `${API}/data`
  : `$${API}/api/data?polling=true`;

const res = await fetch(url, {
  method: "GET",
  credentials: "include",
});

      
      if (res.status === 401) {
        if (showLoading && isInitialLoad) {
          Swal.close();
        }
        window.location.href = "/";
        return;
      }
      // 404 => no uploads yet (treat as empty list)
      if (res.status === 404) {
        if (showLoading && isInitialLoad) Swal.close();
        setUploads([]);
        return;
      }

      if (!res.ok) {
        // Try to parse JSON safely, otherwise fallback to status text
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        if (showLoading && isInitialLoad) {
          Swal.close();
          Swal.fire({
            icon: "error",
            title: "Failed to Load Data",
            text: errorData.message || "Failed to fetch upload history.",
            confirmButtonColor: "#d33",
          });
        }
        setUploads([]);
        return;
      }

      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) {
        setUploads(data);
        if (showLoading && isInitialLoad) {
          Swal.close();
          setIsInitialLoad(false);
        }
      } else {
        if (showLoading && isInitialLoad) {
          Swal.close();
          setIsInitialLoad(false);
        }
        setUploads([]);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      if (showLoading && isInitialLoad) {
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Connection Error",
          text: `Failed to connect to server: ${err.message}. Please make sure the backend server is running.`,
          confirmButtonColor: "#d33",
        });
        setIsInitialLoad(false);
      }
      setUploads([]);
    }
  };

  useEffect(() => {
    fetchUploads(true);
    
    const refreshInterval = setInterval(() => {
      fetchUploads(false);
    }, 5000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Handle file upload
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedExtensions = ["csv", "xlsx"];
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      Swal.fire({
        icon: "error",
        title: "Invalid File Type",
        text: `The file "${file.name}" is not supported. Only CSV and XLSX files are allowed.`,
        confirmButtonColor: "#d33",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const uploadingId = showInfo("Uploading sales data...");
    Swal.fire({
      title: "Uploading...",
      text: "Please wait while your file is being uploaded.",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch(`${API}/data/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await res.json();

      if (!res.ok) {
        Swal.close();
        removeNotification(uploadingId);
        
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: result.message || "Failed to upload file. Please check the file format and try again.",
          confirmButtonColor: "#d33",
        });
        return;
      }

      if (res.ok) {
        Swal.close();

        // ✅ CACHE INVALIDATION - Dashboard needs fresh data
        console.log("🔄 Data uploaded - invalidating dashboard cache...");
        SessionManager.invalidateDashboardCache();

        removeNotification(uploadingId);
        showSuccess(`Sales data uploaded successfully: ${file.name}`);

        const salesID = result.salesID;
        
        if (salesID) {
          setUploadStatusMap(prev => ({ ...prev, [salesID]: "Uploaded" }));
        }

        await fetchUploads();

        // Start preprocessing progress polling
        let progressNotifId = null;
        const poll = async () => {
          try {
            const statusRes = await fetch(`${API}/data/preprocess-status`,
              {
                credentials: "include",
                
              }
            );
            if (!statusRes.ok) return;
            const status = await statusRes.json();

            if (status.state === "running") {
              if (salesID) {
                setUploadStatusMap(prev => ({ ...prev, [salesID]: "Preprocessing" }));
                setUploads(prev => prev.map(u => 
                  u.salesID === salesID ? { ...u, status: "Preprocessing" } : u
                ));
              }

              if (!progressNotifId) {
                progressNotifId = showProgress(
                  "Preprocessing sales data...",
                  status.progress || 0
                );
              } else {
                updateNotification(progressNotifId, {
                  message: status.message || "Preprocessing sales data...",
                  progress:
                    typeof status.progress === "number"
                      ? status.progress
                      : undefined,
                });
              }
            } else if (status.state === "done") {
              if (!progressNotifId) {
                progressNotifId = showProgress("Preprocessing complete.", 100);
              }
              updateNotification(progressNotifId, {
                type: "success",
                message: "Done preprocessing sales data.",
                progress: undefined,
              });
              clearInterval(pollInterval);
              
              // ✅ Preprocessing done - invalidate cache again
              console.log("🔄 Preprocessing done - invalidating cache...");
              SessionManager.invalidateDashboardCache();
              
              fetchUploads();
              startTrainingStatusPolling(salesID);
            } else if (status.state === "error") {
              if (salesID) {
                setUploadStatusMap(prev => ({ ...prev, [salesID]: "Failed" }));
                setUploads(prev => prev.map(u => 
                  u.salesID === salesID ? { ...u, status: "Failed" } : u
                ));
              }

              showError(
                `Preprocessing error: ${status.message || "Unknown error"}`
              );
              if (progressNotifId) {
                updateNotification(progressNotifId, {
                  type: "error",
                  message: "Preprocessing failed.",
                  progress: undefined,
                });
              }
              clearInterval(pollInterval);
              fetchUploads();
            }
          } catch (e) {
            // ignore transient polling errors
          }
        };
        const pollInterval = setInterval(poll, 1500);
        poll();

        // Function to poll training status
        const startTrainingStatusPolling = (fileSalesID) => {
          let trainingNotifId = null;
          const pollTraining = async () => {
            try {
              const trainingStatusRes = await fetch(`${API}/data/training-status`,
                {
                  credentials: "include",
                }
              );
              if (!trainingStatusRes.ok) return;
              const trainingStatus = await trainingStatusRes.json();

              if (trainingStatus.state === "running") {
                if (fileSalesID) {
                  setUploadStatusMap(prev => ({ ...prev, [fileSalesID]: "Training" }));
                  setUploads(prev => prev.map(u => 
                    u.salesID === fileSalesID ? { ...u, status: "Training" } : u
                  ));
                }

                if (!trainingNotifId) {
                  const title = trainingStatus.datasetInfo || "Training Model";
                  const message = trainingStatus.message || "Training model...";
                  trainingNotifId = showProgress(message, trainingStatus.progress || 0, title);
                } else {
                  const message = trainingStatus.currentProduct 
                    ? `Training model for: ${trainingStatus.currentProduct}`
                    : trainingStatus.message || "Training model...";
                  updateNotification(trainingNotifId, {
                    message: message,
                    progress: typeof trainingStatus.progress === "number" ? trainingStatus.progress : undefined,
                    title: trainingStatus.datasetInfo || "Training Model",
                  });
                }
              } else if (trainingStatus.state === "done") {
                if (fileSalesID) {
                  setUploadStatusMap(prev => ({ ...prev, [fileSalesID]: "Completed" }));
                  setUploads(prev => prev.map(u => 
                    u.salesID === fileSalesID ? { ...u, status: "Completed" } : u
                  ));
                }

                if (!trainingNotifId) {
                  trainingNotifId = showProgress("Training complete.", 100, "Training Model");
                }
                updateNotification(trainingNotifId, {
                  type: "success",
                  message: trainingStatus.message || "Done training model.",
                  progress: undefined,
                });
                clearInterval(trainingPollInterval);
                
                // ✅ Training complete - invalidate cache (models are ready!)
                console.log("🔄 Training complete - invalidating cache...");
                SessionManager.invalidateDashboardCache();
                
                fetchUploads();
              } else if (trainingStatus.state === "error") {
                if (fileSalesID) {
                  setUploadStatusMap(prev => ({ ...prev, [fileSalesID]: "Failed" }));
                  setUploads(prev => prev.map(u => 
                    u.salesID === fileSalesID ? { ...u, status: "Failed" } : u
                  ));
                }

                showError(
                  `Training error: ${trainingStatus.message || "Unknown error"}`
                );
                if (trainingNotifId) {
                  updateNotification(trainingNotifId, {
                    type: "error",
                    message: "Training failed.",
                    progress: undefined,
                  });
                }
                clearInterval(trainingPollInterval);
                fetchUploads();
              } else if (trainingStatus.state === "idle") {
                if (fileSalesID) {
                  setUploadStatusMap(prev => ({ ...prev, [fileSalesID]: "Completed" }));
                  setUploads(prev => prev.map(u => 
                    u.salesID === fileSalesID ? { ...u, status: "Completed" } : u
                  ));
                }
                clearInterval(trainingPollInterval);
                fetchUploads();
              }
            } catch (e) {
              // ignore transient polling errors
            }
          };
          const trainingPollInterval = setInterval(pollTraining, 1500);
          pollTraining();
        };

        setCurrentPage(1);
      } else {
        Swal.close();
        removeNotification(uploadingId);
        showError(
          `Upload failed: ${result.message || "Something went wrong."}`
        );
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: result.message || "Something went wrong.",
        });
      }
    } catch (err) {
      Swal.close();
      removeNotification(uploadingId);
      showError(`Upload error: ${err.message}`);
      Swal.fire({
        icon: "error",
        title: "Upload Error",
        text: err.message,
      });
    }
  };

  // Delete an upload
  const handleDelete = async (id) => {
    const confirmDelete = await Swal.fire({
      title: "Are you sure?",
      text: "This upload will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
    });

    if (!confirmDelete.isConfirmed) return;

    try {
      const res = await fetch(`${API}/data/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await res.json();

      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.salesID !== id));
        
        // ✅ Data deleted - invalidate cache
        console.log("🔄 Data deleted - invalidating dashboard cache...");
        SessionManager.invalidateDashboardCache();
        
        showSuccess("Sales data file deleted successfully");
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: result.message,
          confirmButtonColor: "#3085d6",
        });
      } else {
        showError(
          `Delete failed: ${result.message || "Unable to delete file."}`
        );
        Swal.fire({
          icon: "error",
          title: "Delete Failed",
          text: result.message || "Unable to delete file.",
        });
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
      });
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const allowedExtensions = ["csv", "xlsx"];
      const fileExtension = file.name.split(".").pop().toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        Swal.fire({
          icon: "error",
          title: "Invalid File Type",
          text: `The file "${file.name}" is not supported. Only CSV and XLSX files are allowed.`,
          confirmButtonColor: "#d33",
        });
        return;
      }

      handleFileChange({ target: { files } });
    }
  };

  const filteredUploads = uploads.filter((item) => {
    const matchesSearch =
      item.fileName?.toLowerCase().includes(search.toLowerCase()) || false;
    const currentStatus = uploadStatusMap[item.salesID] || item.status;
    const matchesStatus =
      statusFilter === "All"
        ? true
        : statusFilter === "Active Uploads"
        ? currentStatus !== "Completed" && currentStatus !== "Failed" && currentStatus !== "Error"
        : currentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedUploads = [...filteredUploads].sort((a, b) => {
    const dateA = new Date(a.uploadDate).getTime();
    const dateB = new Date(b.uploadDate).getTime();
    return sortOrder.includes("Newest") ? dateB - dateA : dateA - dateB;
  });

  const totalPages = Math.ceil(sortedUploads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = sortedUploads.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleInfoClick = () => {
    Swal.fire({
      title: "📖 Data Management User Guide",
      html: `
        <div class="user-manual-container">
          
          <h3 class="manual-section-title">📁 Uploading Sales Data</h3>
          
          <h4 class="manual-subsection-title">Supported File Formats</h4>
          <ul class="manual-list">
            <li><strong>CSV files (.csv)</strong> - Recommended for faster uploads</li>
            <li><strong>Excel files (.xlsx)</strong> - Supported but may take longer to process</li>
          </ul>
          
          <h4 class="manual-subsection-title">How to Upload</h4>
          <ol class="manual-list">
            <li><strong>Drag & Drop:</strong> Drag your file directly into the upload box</li>
            <li><strong>Browse:</strong> Click "Browse" to select a file from your computer</li>
            <li>Wait for the upload to complete (progress will be shown)</li>
          </ol>
          
          <h4 class="manual-subsection-title">Required Data Columns</h4>
          <p>Your sales data file <strong>must include</strong> these columns:</p>
          <ul class="manual-list">
            <li><code class="manual-code">date</code> - Transaction date (YYYY-MM-DD format)</li>
            <li><code class="manual-code">product_id</code> - Unique product identifier</li>
            <li><code class="manual-code">product_name</code> - Name of the product</li>
            <li><code class="manual-code">category</code> - Product category</li>
            <li><code class="manual-code">quantity</code> - Number of units sold</li>
            <li><code class="manual-code">unit_price</code> - Price per unit</li>
            <li><code class="manual-code">discount</code> - Discount amount (if any)</li>
            <li><code class="manual-code">total_amount</code> - Total sales amount</li>
          </ul>
          
          <h3 class="manual-section-title">📊 Initial Setup (First Time Users)</h3>
          <div class="manual-alert manual-alert-warning">
            <strong>⚠️ Important:</strong> To train accurate forecasting models, you need to upload <strong>at least 3 years</strong> of historical sales data.
          </div>
          <ul class="manual-list">
            <li>Upload one year at a time (e.g., 2022.csv, 2023.csv, 2024.csv)</li>
            <li>Model training will start automatically once 3 years of data is uploaded</li>
            <li>Training may take 10-30 minutes depending on data size</li>
          </ul>
          
          <h3 class="manual-section-title">🔄 Weekly Updates (After Initial Setup)</h3>
          <ul class="manual-list">
            <li>Upload your latest weekly sales data regularly</li>
            <li>System will automatically generate new forecasts</li>
            <li>Keep your forecasts accurate by uploading consistently</li>
          </ul>
          
          <h3 class="manual-section-title">📋 Upload Status Guide</h3>
          <ul class="manual-status-list">
            <li><span class="manual-status manual-status-uploaded">Uploaded</span> - File successfully received</li>
            <li><span class="manual-status manual-status-processing">Preprocessing</span> - Data is being cleaned and validated</li>
            <li><span class="manual-status manual-status-processing">Training</span> - Machine Learning models are being trained</li>
            <li><span class="manual-status manual-status-completed">Completed</span> - Processing finished successfully</li>
            <li><span class="manual-status manual-status-failed">Failed</span> - An error occurred (check file format)</li>
          </ul>
          
          <h3 class="manual-section-title">💡 Best Practices</h3>
          <ul class="manual-list">
            <li>✅ Use CSV format when possible for faster uploads</li>
            <li>✅ Ensure all required columns are present</li>
            <li>✅ Check that dates are in YYYY-MM-DD format</li>
            <li>✅ Remove any empty rows or columns</li>
            <li>✅ Avoid duplicate file names</li>
            <li>✅ Upload files during off-peak hours for large datasets</li>
          </ul>
          
          <h3 class="manual-section-title">🔍 Managing Uploaded Files</h3>
          <ul class="manual-list">
            <li><strong>Search:</strong> Find files by name using the search box</li>
            <li><strong>Filter:</strong> View files by status (All, Active, Completed, etc.)</li>
            <li><strong>Sort:</strong> Sort by upload date (Newest/Oldest first)</li>
            <li><strong>Delete:</strong> Remove files you no longer need</li>
          </ul>
          
          <h3 class="manual-section-title">⚠️ Troubleshooting</h3>
          <div class="manual-alert manual-alert-danger">
            <strong>Upload Failed?</strong> Check these common issues:
            <ul class="manual-alert-list">
              <li>Missing required columns</li>
              <li>Invalid date format (must be YYYY-MM-DD)</li>
              <li>File is corrupted or empty</li>
              <li>File name already exists</li>
              <li>File size too large (split into smaller files)</li>
            </ul>
          </div>
          
          <div class="manual-alert manual-alert-info">
            <strong>💡 Pro Tip:</strong> The system automatically validates your data during upload. If there are any issues, you'll receive a detailed error message explaining what needs to be fixed.
          </div>
          
        </div>
      `,
      icon: "info",
      confirmButtonText: "Got it!",
      confirmButtonColor: "var(--accent)",
      width: "750px",
      customClass: {
        popup: 'user-manual-popup',
        htmlContainer: 'user-manual-content'
      }
    });
  };

  return (
    <div>
      <h2 className="titled">Data Management</h2>

      <div className="upload-data-container">
        <div className="upload-box">
          <div className="upload-header">
            <h3 className="title">Upload New Data</h3>
            <i
              className="btn-custom-swal"
              onClick={handleInfoClick}
              style={{}}
            >
              <FaInfoCircle />
            </i>
          </div>

          <div
            className={`drop-zone ${isDragging ? "drag-active" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="fileUpload"
              accept=".csv, .xlsx"
              onChange={handleFileChange}
              hidden
            />
            <label htmlFor="fileUpload" className="drop-text">
              <div className="icon">
                <FiUploadCloud />
              </div>
              <p>
                Drag and Drop Files or <span className="browse">Browse</span>
              </p>
              <small>Supported formats .CSV and .XLSX</small>
            </label>
          </div>
        </div>
      </div>

      <hr />

      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-search" onClick={() => setCurrentPage(1)}>
              Search
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>All</option>
            <option>Active Uploads</option>
            <option>Uploaded</option>
            <option>Preprocessing</option>
            <option>Training</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>Newest First</option>
            <option>Oldest First</option>
          </select>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Upload Date</th>
                <th>File Name</th>
                <th>Records</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length > 0 ? (
                currentData.map((item) => (
                  <tr key={item.salesID}>
                    <td>
                      {item.uploadDate
                        ? dayjs(item.uploadDate).tz().format("MMMM D, YYYY • h:mm A")
                        : "—"}
                    </td>
                    <td>{item.fileName}</td>
                    <td>{item.records?.toLocaleString() || 0}</td>
                    <td>
                      <span
                        className={`status ${
                          item.status === "Completed"
                            ? "success"
                            : item.status === "Failed" || item.status === "Error"
                            ? "failed"
                            : item.status === "Preprocessing" || item.status === "Training"
                            ? "processing"
                            : item.status === "Uploaded"
                            ? "uploaded"
                            : "pending"
                        }`}
                      >
                        {uploadStatusMap[item.salesID] || item.status}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(item.salesID)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "1rem" }}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
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
    </div>
  );
}