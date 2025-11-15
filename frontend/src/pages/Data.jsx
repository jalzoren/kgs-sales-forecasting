// frontend/src/pages/Data.jsx
import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Swal from "sweetalert2";
import { useNotifications } from "../components/Notifications";
import LoadingOverlay from "../components/LoadingOverlay";
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
  const [isLoading, setIsLoading] = useState(false);
  const itemsPerPage = 5;

  const fetchUploads = async () => {
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/data", {
        credentials: "include",
      });
      
      if (res.status === 401) {
        setIsLoading(false);
        window.location.href = "/";
        return;
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        setIsLoading(false);
        Swal.fire({
          icon: "error",
          title: "Failed to Load Data",
          text: errorData.message || "Failed to fetch upload history.",
          confirmButtonColor: "#d33",
        });
        setUploads([]);
        return;
      }
      
      const data = await res.json();
      if (Array.isArray(data)) {
        setUploads(data);
      } else {
        setUploads([]);
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setIsLoading(false);
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: `Failed to connect to server: ${err.message}. Please make sure the backend server is running.`,
        confirmButtonColor: "#d33",
      });
      setUploads([]);
    }
  };

  useEffect(() => {
    fetchUploads();
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

    // 1) Show uploading info
    const uploadingId = showInfo("Uploading sales data...");
    Swal.fire({
      title: "Uploading...",
      text: "Please wait while your file is being uploaded.",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch("http://localhost:5000/api/data/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await res.json();

      if (!res.ok) {
        // Close loading
        Swal.close();
        removeNotification(uploadingId);
        
        // Show error with details
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: result.message || "Failed to upload file. Please check the file format and try again.",
          confirmButtonColor: "#d33",
        });
        return;
      }

      if (res.ok) {
        // Close loader and switch to notifications-only UX
        Swal.close();

        // 2) Remove 'Uploading...' and show 'Uploaded successfully'
        removeNotification(uploadingId);
        showSuccess(`Sales data uploaded successfully: ${file.name}`);

        // 3) Start preprocessing progress polling
        let progressNotifId = null;
        const poll = async () => {
          try {
            const statusRes = await fetch(
              "http://localhost:5000/api/data/preprocess-status",
              {
                credentials: "include",
              }
            );
            if (!statusRes.ok) return;
            const status = await statusRes.json(); // { state, progress, message }

            if (status.state === "running") {
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
            } else if (status.state === "error") {
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
            }
          } catch (e) {
            // ignore transient polling errors
          }
        };
        const pollInterval = setInterval(poll, 1500);
        poll(); // fire immediately

        fetchUploads();
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
      const res = await fetch(`http://localhost:5000/api/data/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await res.json();

      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.salesID !== id));
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

  // ✅ Filter + Sort + Search + Pagination logic
  const filteredUploads = uploads.filter((item) => {
    const matchesSearch =
      item.fileName?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesStatus =
      statusFilter === "All"
        ? true
        : statusFilter === "Active Uploads"
        ? item.status !== "Completed" && item.status !== "Failed"
        : item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ✅ Sorting by upload date
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
      title: "User Manual",
      html: `
        <div style=" max-height: 250px; overflow-y: auto; text-align: left; padding: 0 10px;">
          <h4>Uploading Files</h4>
          <ol style="padding-left: 20px;">
            <li>As much as possible, CSV files should be uploaded.</li>
            <li>Note: Excel files may take longer to upload.</li>
            <li>Sales data must contain required columns such as:
              <ul>
                <li>date</li>
                <li>product_id</li>
                <li>product_name</li>
                <li>quantity</li>
                <li>discount</li>
                <li>unit_price</li>
                <li>total_amount</li>
              </ul>
            </li>
          </ol>
        </div>
      `,
      icon: "info",
      confirmButtonText: "Understood!",
      confirmButtonColor: "var(--accent)",
      background: "#f5f7fa",
      color: "#001d39",
      width: "400px",
    });
  };
  return (
    <div>
      {isLoading && <LoadingOverlay message="Fetching upload history..." />}
      <h2 className="titled">Data Management</h2>

      {/* Upload Box */}
      <div className="upload-data-container">
        <div className="upload-box">
          <div className="upload-header">
            {" "}
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

      {/* Table */}
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

        <div className="table-container">
          <table className="upload-table">
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
                        ? dayjs(item.uploadDate)
                            .tz()
                            .format("MMMM D, YYYY • h:mm A")
                        : "—"}
                    </td>
                    <td>{item.fileName}</td>
                    <td>{item.records?.toLocaleString() || 0}</td>
                    <td>
                      <span
                        className={`status ${
                          item.status === "Completed"
                            ? "success"
                            : item.status === "Failed"
                            ? "failed"
                            : "pending"
                        }`}
                      >
                        {item.status}
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
                  <td
                    colSpan="5"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination  AA*/}
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
