import React, { useState } from "react";
import "../css/Data.css";
import { FiUploadCloud, FiSearch } from "react-icons/fi";

export default function UploadBox() {
  const [isDragging, setIsDragging] = useState(false);

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
    console.log("Dropped files:", files);
  };

  const handleFileChange = (e) => {
    console.log("Selected files:", e.target.files);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active Uploads");
  const [sortMethod, setSortMethod] = useState("Manual");
  const [sortOrder, setSortOrder] = useState("Newest First");

  const uploads = [
    {
      date: "o",
      from: "Manually",
      fileName: "day20_10_6-12_2025.csv",
      records: 5,
      status: "Failed",
    },
    {
      date: "o",
      from: "Manually",
      fileName: "week2_10_6-12_2025.csv",
      records: 1500,
      status: "0",
    },
    {
      date: "o",
      from: "Manually",
      fileName: "week_9-10_29-5_2025.csv",
      records: 0,
      status: "0",
    },
    {
      date: "o",
      from: "Manually",
      fileName: "pos_data.xlsx",
      records: 0,
      status: "0",
    },
  ];

  return (
    <div>

      <div className="upload-data-container">
        <div className="upload-box">
          <h3>Upload New Data</h3>

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
              </div>{" "}
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
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="search-box">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>Active Uploads</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select
            value={sortMethod}
            onChange={(e) => setSortMethod(e.target.value)}
          >
            <option>Sort By Upload: Manual</option>
            <option>Sort By Upload: Auto</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
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
                <th>Uploaded From</th>
                <th>File Name</th>
                <th>Records</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {uploads.map((item, index) => (
                <tr key={index}>
                  <td>{item.date}</td>
                  <td>{item.from}</td>
                  <td>{item.fileName}</td>
                  <td>{item.records.toLocaleString()}</td>
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
                    <button className="btn-action delete">[Delete]</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
