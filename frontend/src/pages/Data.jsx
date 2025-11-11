// frontend/src/pages/Data.jsx
import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Swal from "sweetalert2";
import { useNotifications } from "../components/Notifications";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

export default function UploadBox() {
  const { showInfo, showSuccess, showError } = useNotifications();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Fetch uploads from backend
  const fetchUploads = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/data", {
        credentials: "include",
      });
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setUploads(data);
    } catch (err) {
      console.error("Error fetching data:", err);
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

    showInfo("Processing sales data...");
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

      if (res.ok) {
        setTimeout(() => {
          Swal.fire({
            icon: "success",
            title: "Upload Successful!",
            text: result.message,
            confirmButtonColor: "#3085d6",
          });
          showSuccess(`Sales data processed successfully: ${file.name}`);
          fetchUploads();
          setCurrentPage(1);
        }, 1000);
      } else {
        showError(`Upload failed: ${result.message || "Something went wrong."}`);
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: result.message || "Something went wrong.",
        });
      }
    } catch (err) {
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
        showError(`Delete failed: ${result.message || "Unable to delete file."}`);
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

  // Filtered & paginated uploads
  const filteredUploads = uploads.filter((item) => {
    const matchesSearch = item.fileName?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesStatus =
      statusFilter === "All"
        ? true
        : statusFilter === "Active Uploads"
        ? item.status !== "Completed" && item.status !== "Failed"
        : item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUploads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredUploads.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div>
      <h2 className="titled">Data Management</h2>

      {/* Upload Box */}
      <div className="upload-data-container">
        <div className="upload-box">
          <h3 className="title">Upload New Data</h3>
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

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            <option>Active Uploads</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option>Sort By: Newest First</option>
            <option>Sort By: Oldest First</option>
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
                    <td>{item.uploadDate ? dayjs(item.uploadDate).tz().format("MMMM D, YYYY • h:mm A") : "—"}</td>
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
                      <button className="btn-delete" onClick={() => handleDelete(item.salesID)}>
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

          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
