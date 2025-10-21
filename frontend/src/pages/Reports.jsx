import React, { useState } from "react";
import "../css/Reports.css";

export default function Reports() {
  const [activeTab, setActiveTab] = useState("download");
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");

  // --- Sample Data ---
  const forecasts = [
    {
      date: "October 1, 2025 | 12:00 AM",
      horizon: "Next 30 days",
      scope: "All Products",
      status: "Completed",
      accuracy: "5.25%",
    },
    {
      date: "October 13, 2025 | 12:00 AM",
      horizon: "Next Week",
      scope: "All Products",
      status: "Completed",
      accuracy: "98.25%",
    },
    {
      date: "October 13, 2025 | 12:00 AM",
      horizon: "Next 30 days",
      scope: "All Products",
      status: "Completed",
      accuracy: "98.25%",
    },
    {
      date: "October 13, 2025 | 12:00 AM",
      horizon: "Next 90 days",
      scope: "All Products",
      status: "Completed",
      accuracy: "98.25%",
    },
  ];

  const deleteHistory = [
    {
      date: "September 25, 2025 | 2:00 PM",
      user: "Admin",
      file: "Forecast_Sept.pdf",
      reason: "Outdated data",
    },
    {
      date: "October 2, 2025 | 1:30 PM",
      user: "Manager",
      file: "Sales_Q4.csv",
      reason: "Duplicate file",
    },
  ];

  // --- Utility: Parse dates safely ---
  const parseDate = (str) => new Date(str.replace("|", ""));

  // --- Filtering & Sorting (Download History) ---
  const filteredForecasts = forecasts
    .filter(
      (f) =>
        f.horizon.toLowerCase().includes(search.toLowerCase()) ||
        f.scope.toLowerCase().includes(search.toLowerCase()) ||
        f.status.toLowerCase().includes(search.toLowerCase())
    )
    .filter((f) => (sortStatus === "All" ? true : f.status === sortStatus))
    .sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return sortOrder === "Newest First"
        ? dateB - dateA
        : dateA - dateB;
    });

  // --- Filtering (Delete History) ---
  const filteredDeleteHistory = deleteHistory
    .filter(
      (d) =>
        d.user.toLowerCase().includes(search.toLowerCase()) ||
        d.file.toLowerCase().includes(search.toLowerCase()) ||
        d.reason.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return sortOrder === "Newest First"
        ? dateB - dateA
        : dateA - dateB;
    });

  return (
    <div>
      <h2 className="titled">Reports Page</h2>

      {/* Tabs */}
      <div className="analytics-container">
        <div className="analytics-header">
          <div className="tab-buttons">
            <button
              className={`tab ${activeTab === "download" ? "active" : ""}`}
              onClick={() => setActiveTab("download")}
            >
              Download History
            </button>
            <button
              className={`tab ${activeTab === "delete" ? "active" : ""}`}
              onClick={() => setActiveTab("delete")}
            >
              Delete History
            </button>
          </div>
        </div>
      </div>

      {/* Shared Toolbar */}
      <div className="table-wrapper">
        <div className="table-toolbar">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={sortStatus}
            onChange={(e) => setSortStatus(e.target.value)}
            disabled={activeTab !== "download"}
          >
            <option value="All">Sort By Status: All</option>
            <option value="Completed">Sort By Status: Completed</option>
            <option value="Failed">Sort By Status: Failed</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option>Newest First</option>
            <option>Oldest First</option>
          </select>
        </div>

        {/* Conditional Table Rendering */}
        <div className="table-container">
          {activeTab === "download" ? (
            <table className="upload-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Horizon</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Accuracy</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredForecasts.map((f, idx) => (
                  <tr key={idx}>
                    <td>{f.date}</td>
                    <td>{f.horizon}</td>
                    <td>{f.scope}</td>
                    <td>
                      <span
                        className={`status ${
                          f.status === "Completed" ? "success" : "failed"
                        }`}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td>{f.accuracy}</td>
                    <td className="actions">
                      <button className="btn-action">[View]</button> |
                      <button className="btn-action">[Download]</button> |
                      <button className="btn-action">[Reforecast]</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="upload-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>File</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeleteHistory.map((d, idx) => (
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
