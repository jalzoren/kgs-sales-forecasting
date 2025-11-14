import React, { useState } from "react";
import "../css/Reports.css";

export default function Reports() {
  const [activeTab, setActiveTab] = useState("download");
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");

  const downloadHistory = [
    { date: "October 13, 2025 | 12:00 AM", fileName: "Forecast_Week.csv", fileType: "CSV", status: "Completed", accuracy: "98.25%" },
    { date: "October 10, 2025 | 3:00 PM", fileName: "Sales_Q4.xlsx", fileType: "Excel", status: "Completed", accuracy: "95.10%" },
    { date: "October 1, 2025 | 1:00 PM", fileName: "Forecast_Oct.pdf", fileType: "PDF", status: "Failed", accuracy: "0%" },
  ];

  const deleteHistory = [
    { date: "September 25, 2025 | 2:00 PM", user: "Admin", file: "Forecast_Sept.pdf", reason: "Outdated data" },
    { date: "October 2, 2025 | 1:30 PM", user: "Manager", file: "Sales_Q4.csv", reason: "Duplicate file" },
  ];

  const parseDate = (str) => new Date(str.replace("|", ""));

  const filteredDownload = downloadHistory
    .filter(f => f.fileName.toLowerCase().includes(search.toLowerCase()) || f.fileType.toLowerCase().includes(search.toLowerCase()) || f.status.toLowerCase().includes(search.toLowerCase()))
    .filter(f => (sortStatus === "All" ? true : f.status === sortStatus))
    .sort((a, b) => sortOrder === "Newest First" ? parseDate(b.date) - parseDate(a.date) : parseDate(a.date) - parseDate(b.date));

  const filteredDelete = deleteHistory
    .filter(d => d.user.toLowerCase().includes(search.toLowerCase()) || d.file.toLowerCase().includes(search.toLowerCase()) || d.reason.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortOrder === "Newest First" ? parseDate(b.date) - parseDate(a.date) : parseDate(a.date) - parseDate(b.date));

  return (
    <div className="reports-page">
      <h2 className="rp-titled">Reports Page</h2>

      {/* Tabs */}
      <div className="rp-tab-buttons-container">
        <button className={`rp-tab ${activeTab === "download" ? "active" : ""}`} onClick={() => setActiveTab("download")}>
          Download History
        </button>
        <button className={`rp-tab ${activeTab === "delete" ? "active" : ""}`} onClick={() => setActiveTab("delete")}>
          Delete History
        </button>
      </div>

      {/* Toolbar */}
      <div className="rp-table-toolbar">
        <div className="rp-search-box">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="rp-btn-search" onClick={() => console.log("Search clicked!")}>Search</button>
        </div>

        <div className="rp-filters">
          {activeTab === "download" && (
            <select value={sortStatus} onChange={e => setSortStatus(e.target.value)}>
              <option value="All">All Status</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
          )}

          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option>Newest First</option>
            <option>Oldest First</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rp-table-container">
        {activeTab === "download" ? (
          <table className="rp-upload-table">
            <thead>
              <tr>
                <th>Download Date</th>
                <th>File Name</th>
                <th>File Type</th>
                <th>Status</th>
                <th>Accuracy</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDownload.map((f, idx) => (
                <tr key={idx}>
                  <td>{f.date}</td>
                  <td>{f.fileName}</td>
                  <td>{f.fileType}</td>
                  <td>
                    <span className={`rp-status ${f.status === "Completed" ? "success" : "failed"}`}>{f.status}</span>
                  </td>
                  <td>{f.accuracy}</td>
                  <td className="rp-actions">
                    <button className="rp-btn-view">View</button>
                    <button className="rp-btn-reforecast">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="rp-upload-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>File</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredDelete.map((d, idx) => (
                <tr key={idx}>
                  <td>{d.date}</td>
                  <td>{d.user}</td>
                  <td>{d.file}</td>
                  <td>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      {/* Pagination */}
      <div className="rp-pagination">
        <button disabled>← Previous</button>
        <button className="active">1</button>
        <button>2</button>
        <button>3</button>
        <span>...</span>
        <button>10</button>
        <button>Next →</button>
      </div>
    </div>
  );
}
