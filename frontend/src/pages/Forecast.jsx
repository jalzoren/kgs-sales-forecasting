import React, { useState, useMemo } from "react";
import "../css/Forecast.css";

export default function Forecast() {
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const forecasts = [
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
    {
      date: "October 1, 2025 | 12:00 AM",
      horizon: "Next 30 days",
      scope: "All Products",
      status: "Failed",
      accuracy: "5.25%",
    },
    {
      date: "September 20, 2025 | 12:00 AM",
      horizon: "Next Week",
      scope: "All Products",
      status: "Completed",
      accuracy: "97.50%",
    },
    {
      date: "September 10, 2025 | 12:00 AM",
      horizon: "Next 90 days",
      scope: "All Products",
      status: "Failed",
      accuracy: "12.40%",
    },
  ];

  // 🔍 Filtering, sorting, and pagination logic
  const filteredForecasts = useMemo(() => {
    let result = [...forecasts];

    // Search by horizon, scope, or date
    if (search.trim() !== "") {
      const lower = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.horizon.toLowerCase().includes(lower) ||
          f.scope.toLowerCase().includes(lower) ||
          f.date.toLowerCase().includes(lower)
      );
    }

    // Filter by status
    if (sortStatus !== "All") {
      result = result.filter((f) => f.status === sortStatus);
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.date.split("|")[0]);
      const dateB = new Date(b.date.split("|")[0]);
      return sortOrder === "Newest First" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [search, sortStatus, sortOrder, forecasts]);

  // Pagination
  const totalPages = Math.ceil(filteredForecasts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentForecasts = filteredForecasts.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div>
      <h2 className="titled">Forecast History</h2>

      <div className="table-wrapper">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search forecasts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-search" onClick={() => setCurrentPage(1)}>
              Search
            </button>
          </div>

          <select value={sortStatus} onChange={(e) => setSortStatus(e.target.value)}>
            <option>All</option>
            <option>Completed</option>
            <option>Failed</option>
          </select>

          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option>Newest First</option>
            <option>Oldest First</option>
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
              {currentForecasts.length > 0 ? (
                currentForecasts.map((f, idx) => (
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
                      <button className="btn-view">View</button>
                      <button className="btn-download">Download</button>
                      <button className="btn-reforecast">Reforecast</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "1rem" }}>
                    No forecasts found
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
