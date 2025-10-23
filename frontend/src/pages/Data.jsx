import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Manila"); // 🇵🇭 Philippine timezone


export default function UploadBox() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active Uploads");
  const [sortMethod, setSortMethod] = useState("Manual");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

useEffect(() => {
  fetch("http://localhost:5000/api/data", {
    credentials: 'include'
  })
    .then((res) => {
      if (res.status === 401) {
        // Redirect to login if not authenticated
        window.location.href = '/';
        return [];
      }
      if (!res.ok) {
        throw new Error('Failed to fetch data');
      }
      return res.json();
    })
    .then((data) => {
      if (Array.isArray(data)) {
        setUploads(data);
      } else {
        setUploads([]);
      }
    })
    .catch((err) => {
      console.error("Error fetching data:", err);
      setUploads([]);
    });
}, []);

  // 📤 Handle file upload
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:5000/api/data/upload", {
        method: "POST",
        credentials: 'include',
        body: formData,
      });
      const result = await res.json();
      alert("✅ File uploaded successfully!");
      console.log(result);
      // Refresh uploads
      const updated = await fetch("http://localhost:5000/api/data", {
        credentials: 'include'
      }).then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/';
          return [];
        }
        if (!r.ok) {
          throw new Error('Failed to fetch');
        }
        return r.json();
      });
      setUploads(updated);
      setCurrentPage(1); // reset to first page
    } catch (err) {
      console.error(err);
      alert("❌ Upload failed.");
    }
  };

  // 🗑 Delete upload
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this upload?")) return;
    try {
      await fetch(`http://localhost:5000/api/data/${id}`, { method: "DELETE", credentials: 'include' });
      setUploads((prev) => prev.filter((u) => u.salesID !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // 🖱 Drag events
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
        statusFilter === "Active Uploads"
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
                currentData.map((item, index) => (
                  <tr key={index}>
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
                          item.status === "Success"
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
