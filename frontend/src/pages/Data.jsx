import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Swal from "sweetalert2";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila");

export default function UploadBox() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortMethod, setSortMethod] = useState("Manual");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // 🔄 Fetch existing uploads
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
      console.log("📥 Fetched data:", data); // Debug log
      if (Array.isArray(data)) setUploads(data);
    } catch (err) {
      console.error("Error fetching data:", err);
      setUploads([]);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  // 📤 Handle file upload - WORKING VERSION
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

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
        // Wait for backend processing
        setTimeout(() => {
          Swal.fire({
            icon: "success",
            title: "Upload Successful!",
            text: result.message,
            confirmButtonColor: "#3085d6",
          });
          fetchUploads(); // Refresh data
          setCurrentPage(1);
        }, 3000);
      } else {
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: result.message || "Something went wrong.",
        });
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Upload Error",
        text: err.message,
      });
    }
  };

  // 🗑 Delete upload
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
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: result.message,
          confirmButtonColor: "#3085d6",
        });
      } else {
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
      const fakeEvent = { target: { files } };
      handleFileChange(fakeEvent);
    }
  };


  // 🔍 Filter + Search logic
  const filteredUploads = Array.isArray(uploads) 
    ? uploads.filter((item) => {
      const matchesSearch = item.fileName?.toLowerCase().includes(search.toLowerCase()) || false;
      const matchesStatus =
        statusFilter === "All"
          ? true
          : statusFilter === "Active Uploads"
          ? item.status !== "Completed" && item.status !== "Failed"
          : item.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
  : [];

  // 🔢 Pagination logic
  const totalPages = Math.ceil(filteredUploads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredUploads.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div>
      <h2 className="titled">Data Management</h2>

      {/* Upload Section */}
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

      <br />
      <hr />

      {/* Table Section */}
      <div className="table-wrapper">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            <option>Active Uploads</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select value={sortMethod} onChange={(e) => setSortMethod(e.target.value)}>
            <option>Sort By Upload: Manual</option>
            <option>Sort By Upload: Auto</option>
          </select>

          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option>Sort By: Newest First</option>
            <option>Sort By: Oldest First</option>
          </select>
        </div>

        {/* Table */}
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
                        ? dayjs(item.uploadDate).tz().format("MMMM D, YYYY • h:mm A")
                        : "—"}
                    </td>
                    <td>{item.fileName}</td>
                    <td>{item.records?.toLocaleString() || 0}</td>
                    <td>
                    <span
                      className={`status ${
                        item.status === "Completed"  // ← Changed from "Success" to "Completed"
                          ? "success"
                          : item.status === "Failed"
                          ? "failed"
                          : "pending"  // This covers "Processing" status
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                    <td className="actions">
                      <button className="btn-action">[View]</button> |
                      <button
                        className="btn-action delete"
                        onClick={() => handleDelete(item.salesID)}
                      >
                        [Delete]
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
