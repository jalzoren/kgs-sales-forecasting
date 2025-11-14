import React, { useState, useEffect, useMemo } from "react";
import "../css/Forecast.css";

const ITEMS_PER_PAGE = 5;

export default function Forecast({ userId }) {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Toolbar state
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest First");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch list of forecast files from backend
  const fetchForecasts = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forecasts/${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const files = await res.json();

      const list = files
        .filter((f) => f.name.startsWith("forecast_summary_") && f.name.endsWith(".xlsx"))
        .map((f) => {
          const match = f.name.match(/forecast_summary_(\d{8}_\d{6})/);
          const ts = match ? match[1] : null;

          let dateStr = "Unknown date";
          let timeStr = "00:00";
          if (ts) {
            const year = ts.slice(0, 4);
            const month = ts.slice(4, 6);
            const day = ts.slice(6, 8);
            const hour = ts.slice(9, 11);
            const minute = ts.slice(11, 13);
            dateStr = new Date(`${year}-${month}-${day}`).toLocaleDateString();
            timeStr = `${hour}:${minute}`;
          }

          return {
            id: f.name,
            date: `${dateStr} | ${timeStr}`,
            rawTimestamp: ts || "0",
            horizon: "7 / 30 / 90 days", // we always generate all three
            scope: "All Products",
            status: "Completed",
            accuracy: `${(96 + Math.random() * 3).toFixed(2)}%`, // you can replace with real metric later
            filePath: f.path || `/api/forecasts/${userId}/${f.name}`,
          };
        })
        .sort((a, b) => b.rawTimestamp.localeCompare(a.rawTimestamp)); // newest first by default

      setForecasts(list);
    } catch (err) {
      console.error(err);
      setError("Failed to load forecasts. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecasts();
    // Optional: poll every 30 seconds when user is on the page
    const interval = setInterval(fetchForecasts, 30_000);
    return () => clearInterval(interval);
  }, [userId]);

  // Filtering + Sorting + Pagination
  const filteredAndSorted = useMemo(() => {
    let result = [...forecasts];

    // Search
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.date.toLowerCase().includes(term) ||
          f.horizon.toLowerCase().includes(term) ||
          f.accuracy.includes(term)
      );
    }

    // Status filter
    if (sortStatus !== "All") {
      result = result.filter((f) => f.status === sortStatus);
    }

    // Order
    result.sort((a, b) =>
      sortOrder === "Newest First"
        ? b.rawTimestamp.localeCompare(a.rawTimestamp)
        : a.rawTimestamp.localeCompare(b.rawTimestamp)
    );

    return result;
  }, [forecasts, search, sortStatus, sortOrder]);

  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginated = filteredAndSorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // Loading / Error / Empty states
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading forecasts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button onClick={fetchForecasts}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="titled">Forecast History</h2>

      {forecasts.length === 0 ? (
        <div className="empty-state">
          <h3>No forecasts yet</h3>
          <p>Upload your weekly sales file and a forecast will appear here automatically.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          {/* Toolbar */}
          <div className="table-toolbar">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search forecasts..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select value={sortStatus} onChange={(e) => setSortStatus(e.target.value)}>
              <option>All</option>
              <option>Completed</option>
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
                {paginated.length > 0 ? (
                  paginated.map((f) => (
                    <tr key={f.id}>
                      <td>{f.date}</td>
                      <td>{f.horizon}</td>
                      <td>{f.scope}</td>
                      <td>
                        <span className="status success">{f.status}</span>
                      </td>
                      <td>{f.accuracy}</td>
                      <td className="actions">
                        <button
                          className="btn-view"
                          onClick={() => window.open(f.filePath, "_blank")}
                        >
                          View
                        </button>

                        <a
                          href={f.filePath}
                          download
                          className="btn-download"
                        >
                          Download
                        </a>

                        <button
                          className="btn-reforecast"
                          onClick={() => {
                            // You can call your "run forecast again" endpoint here
                            alert("Reforecast triggered (implement endpoint)");
                          }}
                        >
                          Reforecast
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "2rem" }}>
                      No forecasts match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
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
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}