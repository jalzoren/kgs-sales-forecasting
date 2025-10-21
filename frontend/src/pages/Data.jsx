import React, { useState, useEffect } from "react";
import "../css/Data.css";
import { FiUploadCloud } from "react-icons/fi";

export default function UploadBox() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active Uploads");
  const [sortMethod, setSortMethod] = useState("Manual");
  const [sortOrder, setSortOrder] = useState("Newest First");

useEffect(() => {
  fetch("http://localhost:5000/api/data")
    .then((res) => res.json())
    .then((data) => setUploads(data))
    .catch((err) => console.error("Error fetching data:", err));
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
        body: formData,
      });
      const result = await res.json();
      console.log(result);
      alert("✅ File uploaded successfully!");
      // Refresh uploads
      const updated = await fetch("http://localhost:5000/api/data").then((r) => r.json());
      setUploads(updated);
    } catch (err) {
      console.error(err);
      alert("❌ Upload failed.");
    }
  };

  // 🗑 Delete upload
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this upload?")) return;
    try {
      await fetch(`http://localhost:5000/api/data/${id}`, { method: "DELETE" });
      setUploads((prev) => prev.filter((u) => u.salesID !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Drag events
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

  return (
    <div>
      <h2 className="titled">Data Management</h2>

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

      <div className="table-wrapper">
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
              {uploads.map((item, index) => (
                <tr key={index}>
                  <td>{item.uploadDate || "—"}</td>
                  <td>{item.fileName}</td>
                  <td>{item.records?.toLocaleString() || 0}</td>
                  <td>
                    <span
                      className={`status ${
                        item.status === "Success" ? "success" : "failed"
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button disabled>← Previous</button>
          <button className="active">1</button>
          <button>2</button>
          <button>3</button>
          <span>...</span>
          <button>67</button>
          <button>68</button>
          <button>Next →</button>
        </div>
      </div>
    </div>
  );
}
