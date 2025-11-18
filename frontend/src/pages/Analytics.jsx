import React, { useState, useEffect } from "react";
import "../css/Analytics.css";
import Swal from 'sweetalert2'; 
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function Analytics() {
  const [activeTab, setActiveTab] = useState("sales");
  const [forecastData, setForecastData] = useState([]);
  const [chartMode, setChartMode] = useState("general");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [forecastHorizon, setForecastHorizon] = useState("90d");
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState("line"); // New state for chart type

  // Pagination state for Inventory Alerts
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Inventory Alerts filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("demand-asc");

  // Fetch forecast data from backend when horizon changes
  useEffect(() => {
    setLoading(true);
    setCurrentPage(1); // Reset to first page when horizon changes
    
    // ⭐ SHOW SWEET ALERT LOADING
    Swal.fire({
      title: 'Loading Forecast Data...',
      html: `Fetching ${forecastHorizon === "7d" ? "7-day" : forecastHorizon === "30d" ? "30-day" : "90-day"} forecast`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    fetch(`http://localhost:5000/api/forecast/analytics?horizon=${forecastHorizon}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Please log in to view analytics");
          }
          throw new Error("Failed to fetch forecast data");
        }
        return res.json();
      })
      .then((data) => {
        console.log(`📊 Received forecast data for ${forecastHorizon}:`, data);

        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn("⚠️ No forecast data found.");
          setForecastData([]);
          setLoading(false);
          
          // ⭐ SHOW WARNING
          Swal.fire({
            icon: 'warning',
            title: 'No Forecast Data',
            text: 'Please generate a forecast first.',
            confirmButtonColor: '#0a4174'
          });
          return;
        }

        const validData = data.filter(item => {
          if (!item) return false;
          const hasDate = item.date !== undefined && item.date !== null;
          const hasForecasted = item.forecasted !== undefined && item.forecasted !== null;
          return hasDate && hasForecasted;
        });

        console.log(`✅ Valid data items: ${validData.length} out of ${data.length}`);
        
        // Sort data by date to ensure proper order
        const sortedData = validData.sort((a, b) => {
          try {
            return new Date(a.date) - new Date(b.date);
          } catch {
            return 0;
          }
        });
        
        console.log(`📅 Date range: ${sortedData[0]?.date} to ${sortedData[sortedData.length - 1]?.date}`);
        
        setForecastData(sortedData);

        // DEBUG: Check unique dates
        const uniqueDates = Array.from(new Set(sortedData.map(d => d.date)));
        console.log(`📊 Total rows: ${sortedData.length}`);
        console.log(`📊 Unique dates: ${uniqueDates.length}`);
        console.log(`📊 First date: ${uniqueDates[0]}`);
        console.log(`📊 Last date: ${uniqueDates[uniqueDates.length - 1]}`);

        setLoading(false);
        
        // ⭐ CLOSE LOADING
        Swal.close();
      })
      .catch((err) => {
        console.error("Error fetching forecast:", err);
        setLoading(false);
        
        // ⭐ SHOW ERROR
        Swal.fire({
          icon: 'error',
          title: 'Error Loading Forecast',
          text: err.message || 'Failed to load forecast data',
          confirmButtonColor: '#0a4174'
        });
      });
  }, [forecastHorizon]); // Re-fetch when horizon changes

  // Prepare chart data based on mode - USE ALL DATA FROM BACKEND (already filtered by horizon)
  let chartData = [];
  
  console.log("📈 Preparing chart data. Mode:", chartMode, "Horizon:", forecastHorizon, "Data length:", forecastData.length);
  
  if (forecastData.length === 0) {
    console.warn("⚠️ No forecast data available for chart");
  } else if (chartMode === "general") {
    // Aggregate by date for general view
    const totals = forecastData.reduce((acc, curr) => {
      const dateKey = typeof curr.date === 'string' ? curr.date : (curr.date instanceof Date ? curr.date.toISOString().split('T')[0] : String(curr.date));
      if (!acc[dateKey]) {
        acc[dateKey] = { 
          date: dateKey, 
          forecasted: 0, 
          revenue: 0 
        };
      }
      const forecastedVal = parseFloat(curr.forecasted) || 0;
      const revenueVal = parseFloat(curr.revenue) || 0;
      acc[dateKey].forecasted += forecastedVal;
      acc[dateKey].revenue += revenueVal;
      return acc;
    }, {});
    chartData = Object.values(totals).sort((a, b) => {
      try {
        return new Date(a.date) - new Date(b.date);
      } catch {
        return 0;
      }
    });
    console.log("📈 General chart data prepared:", chartData.length, "points");
    if (chartData.length > 0) {
      console.log(`📅 Chart date range: ${chartData[0].date} to ${chartData[chartData.length - 1].date}`);
    }
  } else if (chartMode === "product" && selectedProduct) {
    chartData = forecastData
      .filter((d) => d.product === selectedProduct)
      .map(d => ({
        ...d,
        date: typeof d.date === 'string' ? d.date : (d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date)),
        forecasted: parseFloat(d.forecasted) || 0,
        revenue: parseFloat(d.revenue) || 0
      }))
      .sort((a, b) => {
        try {
          return new Date(a.date) - new Date(b.date);
        } catch {
          return 0;
        }
      });
    console.log("📈 Product chart data prepared:", chartData.length, "points");
  } else if (chartMode === "category" && selectedCategory) {
    const catTotals = forecastData
      .filter((d) => d.category === selectedCategory)
      .reduce((acc, curr) => {
        const dateKey = typeof curr.date === 'string' ? curr.date : (curr.date instanceof Date ? curr.date.toISOString().split('T')[0] : String(curr.date));
        if (!acc[dateKey]) {
          acc[dateKey] = { 
            date: dateKey, 
            forecasted: 0, 
            revenue: 0 
          };
        }
        const forecastedVal = parseFloat(curr.forecasted) || 0;
        const revenueVal = parseFloat(curr.revenue) || 0;
        acc[dateKey].forecasted += forecastedVal;
        acc[dateKey].revenue += revenueVal;
        return acc;
      }, {});
    chartData = Object.values(catTotals).sort((a, b) => {
      try {
        return new Date(a.date) - new Date(b.date);
      } catch {
        return 0;
      }
    });
    console.log("📈 Category chart data prepared:", chartData.length, "points");
  }

  const renderCircularChart = (label) => (
    <div className="analytics-circle-progress">
      <svg viewBox="0 0 36 36" className="analytics-circular-chart">
        <path
          className="analytics-circle-bg"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="analytics-circle"
          strokeDasharray="96, 100"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <text x="18" y="20.35" className="analytics-percentage">
          96.25%
        </text>
      </svg>
      <p className="analytics-metric-label">{label}</p>
    </div>
  );

  // Calculate date range for display
  const getDateRange = () => {
    if (forecastData.length === 0) return "N/A";
    const sortedDates = [...forecastData].sort((a, b) => new Date(a.date) - new Date(b.date));
    const startDate = new Date(sortedDates[0].date).toLocaleDateString();
    const endDate = new Date(sortedDates[sortedDates.length - 1].date).toLocaleDateString();
    return `${startDate} - ${endDate}`;
  };

  return (
    <div className="analytics-page-container">
      <h2 className="analytics-title">Analytics Page</h2>

      {/* Tabs */}
      <div className="analytics-tab-buttons">
        <button
          className={`analytics-tab ${activeTab === "sales" ? "active" : ""}`}
          onClick={() => setActiveTab("sales")}
        >
          Sales Performance
        </button>
        <button
          className={`analytics-tab ${activeTab === "inventory" ? "active" : ""}`}
          onClick={() => setActiveTab("inventory")}
        >
          Inventory Alerts
        </button>
      </div>

      {/* Toolbar / Filters */}
      {activeTab === "sales" && (
        <div className="analytics-toolbar">
          <div className="analytics-filters">
            {/* Forecast Horizon Dropdown */}
            <label>
              Forecast Horizon:{" "}
              <select value={forecastHorizon} onChange={(e) => setForecastHorizon(e.target.value)}>
                <option value="7d">Next 7 Days</option>
                <option value="30d">Next 30 Days</option>
                <option value="90d">Next 90 Days</option>
              </select>
            </label>
            
            <label>
              Chart Mode:{" "}
              <select value={chartMode} onChange={(e) => setChartMode(e.target.value)}>
                <option value="general">General</option>
                <option value="product">Per Product</option>
                <option value="category">Per Category</option>
              </select>
            </label>
            
            <label>
              Chart Type:{" "}
              <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                <option value="line">Line Chart</option>
                <option value="bar">Bar Chart</option>
                <option value="area">Area Chart</option>
              </select>
            </label>
            
            {chartMode === "product" && (
              <label>
                Product:{" "}
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="">Select Product</option>
                  {Array.from(new Set(forecastData.map((d) => d.product))).map((p, i) => (
                    <option key={i} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            
            {chartMode === "category" && (
              <label>
                Category:{" "}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">Select Category</option>
                  {Array.from(new Set(forecastData.map((d) => d.category))).map((c, i) => (
                    <option key={i} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Conditional Rendering */}
      {activeTab === "sales" ? (
        <>
          {/* Side-by-side wrapper for metrics and chart */}
          <div className="analytics-content-wrapper">
            {/* Metrics Box */}
            <div className="analytics-metrics-box">
              <div className="analytics-metrics-info">
                <p>
                  <strong>Forecast Date Range:</strong> {getDateRange()}
                </p>
                <p>
                  <strong>Number of Days:</strong> {forecastData.length > 0 ? Array.from(new Set(forecastData.map(d => d.date))).length : "N/A"} days
                </p>
                <p>
                  <strong>Forecast Horizon:</strong> {forecastHorizon === "7d" ? "Next 7 Days" : forecastHorizon === "30d" ? "Next 30 Days" : "Next 90 Days"}
                </p>
                <p>
                  <strong>Total Forecasted Units:</strong> {forecastData.reduce((sum, d) => sum + (parseFloat(d.forecasted) || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="analytics-metrics-charts">
                {renderCircularChart("Total Products")}
                {renderCircularChart("Categories")}
                {renderCircularChart("Forecast Accuracy")}
              </div>
            </div>

            {/* Line Chart */}
            <div className="analytics-chart-section">
              {chartData.length > 0 ? (
                <>
                  {console.log("🎨 Rendering chart with data:", chartData.length, "points")}
                  {console.log("🎨 First 3 dates:", chartData.slice(0, 3).map(d => d.date))}
                  {console.log("🎨 Last 3 dates:", chartData.slice(-3).map(d => d.date))}
                  
                  {chartType === "line" && (
                    <LineChart width={900} height={350} data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#c9d6e3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }
                            return value;
                          } catch {
                            return value;
                          }
                        }}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return `Date: ${date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;
                            }
                            return `Date: ${value}`;
                          } catch {
                            return `Date: ${value}`;
                          }
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="forecasted"
                        stroke="#0a4174"
                        strokeWidth={2}
                        name="Forecast Qty"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#41a7dd"
                        strokeWidth={2}
                        name="Revenue Estimate"
                        dot={false}
                      />
                    </LineChart>
                  )}

                  {chartType === "bar" && (
                    <BarChart width={900} height={350} data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#c9d6e3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }
                            return value;
                          } catch {
                            return value;
                          }
                        }}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return `Date: ${date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;
                            }
                            return `Date: ${value}`;
                          } catch {
                            return `Date: ${value}`;
                          }
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="forecasted"
                        fill="#0a4174"
                        name="Forecast Qty"
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#41a7dd"
                        name="Revenue Estimate"
                      />
                    </BarChart>
                  )}

                  {chartType === "area" && (
                    <AreaChart width={900} height={350} data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#c9d6e3" />
                      <XAxis 
                        dataKey="date" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }
                            return value;
                          } catch {
                            return value;
                          }
                        }}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                              return `Date: ${date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;
                            }
                            return `Date: ${value}`;
                          } catch {
                            return `Date: ${value}`;
                          }
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="forecasted"
                        stroke="#0a4174"
                        fill="#0a4174"
                        fillOpacity={0.6}
                        name="Forecast Qty"
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#41a7dd"
                        fill="#41a7dd"
                        fillOpacity={0.6}
                        name="Revenue Estimate"
                      />
                    </AreaChart>
                  )}
                </>
              ) : (
                <div style={{ padding: "50px", textAlign: "center" }}>
                  <p>No chart data available. 
                    {forecastData.length > 0 ? ` (${forecastData.length} forecast records loaded, but no data for current filter)` : " Please ensure forecast data exists."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="analytics-toolbar">
  <div className="analytics-grid-3">

    {/* Column 1 – Row 1 */}
    <label>
      Forecast Horizon
      <select
        value={forecastHorizon}
        onChange={(e) => {
          setForecastHorizon(e.target.value);
          setCurrentPage(1);
        }}
      >
        <option value="7d">Next 7 Days</option>
        <option value="30d">Next 30 Days</option>
        <option value="90d">Next 90 Days</option>
      </select>
    </label>

    {/* Column 2 – Row 1 */}
    <label>
      Category
      <select
        value={filterCategory}
        onChange={(e) => {
          setFilterCategory(e.target.value);
          setCurrentPage(1);
        }}
      >
        <option value="all">All Categories</option>
        {Array.from(new Set(forecastData.map((d) => d.category).filter(Boolean)))
          .sort()
          .map((c, i) => (
            <option key={i} value={c}>{c}</option>
          ))}
      </select>
    </label>

    {/* Column 3 – Row 1 (SEARCH) */}
    <label className="search-cont">
      Search
      <input
        type="text"
        placeholder="Search products..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setCurrentPage(1);
        }}
      />
    </label>

    {/* Column 1 – Row 2 */}
    <label>
      Status
      <select
        value={filterStatus}
        onChange={(e) => {
          setFilterStatus(e.target.value);
          setCurrentPage(1);
        }}
      >
        <option value="all">All Status</option>
        <option value="critical">Critical - Low Stock</option>
        <option value="warning">Warning - Monitor Stock</option>
        <option value="good">Good</option>
      </select>
    </label>

    {/* Column 2 – Row 2 */}
    <label>
      Sort By
      <select
        value={sortBy}
        onChange={(e) => {
          setSortBy(e.target.value);
          setCurrentPage(1);
        }}
      >
        <option value="demand-asc">Demand (Low to High)</option>
        <option value="demand-desc">Demand (High to Low)</option>
        <option value="name-asc">Product Name (A-Z)</option>
        <option value="name-desc">Product Name (Z-A)</option>
        <option value="status">Status (Critical First)</option>
      </select>
    </label>

    {/* Column 3 – Row 2 (CLEAR FILTERS) */}
    <div className="button-cell">
      <button
        className="clear-filters"
        onClick={() => {
          setSearchQuery("");
          setFilterCategory("all");
          setFilterStatus("all");
          setSortBy("demand-asc");
          setCurrentPage(1);
        }}
      >
        Clear Filters
      </button>
    </div>

  </div>
</div>

          
          <div className="analytics-inventory-alerts">
            <h3>Inventory Alerts - {forecastHorizon === "7d" ? "Next 7 Days" : forecastHorizon === "30d" ? "Next 30 Days" : "Next 90 Days"}</h3>
            <p>Date Range: {getDateRange()}</p>
            <p>Shows forecasted demand based on {forecastHorizon} forecast.</p>

            {forecastData.length > 0 ? (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Forecasted Demand</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Aggregate data by product
                      let aggregated = Object.values(
                        forecastData.reduce((acc, row) => {
                          const productKey = row.product || "Unknown";
                          if (!acc[productKey]) {
                            acc[productKey] = {
                              product: productKey,
                              category: row.category || "All",
                              totalForecasted: 0
                            };
                          }
                          acc[productKey].totalForecasted += parseFloat(row.forecasted || 0);
                          return acc;
                        }, {})
                      );

                      // Apply search filter
                      if (searchQuery.trim()) {
                        const query = searchQuery.toLowerCase();
                        aggregated = aggregated.filter(item => 
                          item.product.toLowerCase().includes(query)
                        );
                      }

                      if (filterCategory !== "all") {
                        aggregated = aggregated.filter(item => item.category === filterCategory);
                      }

                      // Calculate status for filtering
                      const lowThreshold = forecastHorizon === "7d" ? 10 : forecastHorizon === "30d" ? 50 : 100;
                      const outThreshold = forecastHorizon === "7d" ? 5 : forecastHorizon === "30d" ? 20 : 50;

                      aggregated = aggregated.map(item => {
                        const forecasted = Math.round(item.totalForecasted);
                        let statusType = "good";
                        if (forecasted <= outThreshold) statusType = "critical";
                        else if (forecasted <= lowThreshold) statusType = "warning";
                        
                        return { ...item, statusType, forecasted };
                      });

                      // Apply status filter
                      if (filterStatus !== "all") {
                        aggregated = aggregated.filter(item => item.statusType === filterStatus);
                      }

                      // Apply sorting
                      aggregated.sort((a, b) => {
                        switch (sortBy) {
                          case "demand-asc":
                            return a.forecasted - b.forecasted;
                          case "demand-desc":
                            return b.forecasted - a.forecasted;
                          case "name-asc":
                            return a.product.localeCompare(b.product);
                          case "name-desc":
                            return b.product.localeCompare(a.product);
                          case "status":
                            const statusOrder = { critical: 0, warning: 1, good: 2 };
                            return statusOrder[a.statusType] - statusOrder[b.statusType];
                          default:
                            return 0;
                        }
                      });

                      const totalItems = aggregated.length;
                      const totalPages = Math.ceil(totalItems / itemsPerPage);
                      const startIdx = (currentPage - 1) * itemsPerPage;
                      const paginatedData = aggregated.slice(startIdx, startIdx + itemsPerPage);

                      // Show message if no results
                      if (aggregated.length === 0) {
                        return (
                          <tr>
                            <td colSpan="4" style={{ textAlign: "center", padding: "20px" }}>
                              No products match your filters. Try adjusting your search or filters.
                            </td>
                          </tr>
                        );
                      }

                      return paginatedData.map((item, idx) => {
                        const status = item.statusType === "critical" ? "Critical - Low Stock" : 
                                       item.statusType === "warning" ? "Warning - Monitor Stock" : 
                                       "Good";
                        const statusColor = item.statusType === "critical" ? "red" : 
                                            item.statusType === "warning" ? "orange" : 
                                            "green";
                        
                        return (
                          <tr key={startIdx + idx}>
                            <td>{item.product}</td>
                            <td>{item.category}</td>
                            <td>{item.forecasted.toLocaleString()} units</td>
                            <td style={{ color: statusColor, fontWeight: "bold" }}>
                              {status}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {(() => {
                  // Recalculate with filters for pagination
                  let aggregated = Object.values(
                    forecastData.reduce((acc, row) => {
                      const productKey = row.product || "Unknown";
                      if (!acc[productKey]) {
                        acc[productKey] = {
                          product: productKey,
                          category: row.category || "All",
                          totalForecasted: 0
                        };
                      }
                      acc[productKey].totalForecasted += parseFloat(row.forecasted || 0);
                      return acc;
                    }, {})
                  );

                  // Apply search filter
                  if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase();
                    aggregated = aggregated.filter(item => 
                      item.product.toLowerCase().includes(query)
                    );
                  }

                  // Apply category filter
                  if (filterCategory !== "all") {
                    aggregated = aggregated.filter(item => item.category === filterCategory);
                  }

                  // Apply status filter
                  if (filterStatus !== "all") {
                    const lowThreshold = forecastHorizon === "7d" ? 10 : forecastHorizon === "30d" ? 50 : 100;
                    const outThreshold = forecastHorizon === "7d" ? 5 : forecastHorizon === "30d" ? 20 : 50;
                    
                    aggregated = aggregated.filter(item => {
                      const forecasted = Math.round(item.totalForecasted);
                      let statusType = "good";
                      if (forecasted <= outThreshold) statusType = "critical";
                      else if (forecasted <= lowThreshold) statusType = "warning";
                      return statusType === filterStatus;
                    });
                  }

                  const totalPages = Math.ceil(aggregated.length / itemsPerPage);
                  const totalItems = aggregated.length;

                  if (totalPages <= 1) return null;

                  return (
                    <div className="pagination-controls" style={{ marginTop: "20px", textAlign: "center" }}>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        style={{ 
                          margin: "0 5px", 
                          padding: "8px 12px",
                          cursor: currentPage === 1 ? "not-allowed" : "pointer",
                          opacity: currentPage === 1 ? 0.5 : 1
                        }}
                      >
                        Previous
                      </button>
                      
                      <span style={{ margin: "0 15px", fontWeight: "bold" }}>
                        Page {currentPage} of {totalPages} ({totalItems} items)
                      </span>
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        style={{ 
                          margin: "0 5px", 
                          padding: "8px 12px",
                          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                          opacity: currentPage === totalPages ? 0.5 : 1
                        }}
                      >
                        Next
                      </button>
                    </div>
                  );
                })()}
              </>
            ) : (
              <p>No forecast data available for inventory alerts</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}