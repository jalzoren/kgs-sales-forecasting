import React, { useState } from "react";
import "../css/Reports.css";

export default function Reports() {
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");

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

  return (
    <div>
      <h2 className="titled">Reports Page</h2>
      <div className="analytics-container">
        {/* Tabs */}
        <div className="analytics-header">
          <div className="tab-buttons">
            <button className="tab active">Download History</button>
            <button className="tab">Delete History</button>
          </div>
        </div>
        </div>
      <div className="table-wrapper">
        {/* Toolbar */}
        <div className="table-toolbar">
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select value={sortStatus} onChange={(e) => setSortStatus(e.target.value)}>
            <option>Sort By Status: All</option>
            <option>Sort By Status: Completed</option>
            <option>Sort By Status: Failed</option>
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
                <th>Date</th>
                <th>Horizon</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Accuracy</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f, idx) => (
                <tr key={idx}>
                  <td>{f.date}</td>
                  <td>{f.horizon}</td>
                  <td>{f.scope}</td>
                  <td>
                    <span className={`status ${f.status === "Completed" ? "success" : "failed"}`}>
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
