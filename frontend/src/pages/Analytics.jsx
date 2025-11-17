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

  // Fetch forecast data from backend when horizon changes
  useEffect(() => {
    setLoading(true);
    
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

  // ⭐ REMOVED: if (loading) return <p>Loading forecast data...</p>;

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
          {/* Inventory Alerts with Horizon Dropdown */}
          <div className="analytics-toolbar">
            <div className="analytics-filters">
              <label>
                Forecast Horizon:{" "}
                <select value={forecastHorizon} onChange={(e) => setForecastHorizon(e.target.value)}>
                  <option value="7d">Next 7 Days</option>
                  <option value="30d">Next 30 Days</option>
                  <option value="90d">Next 90 Days</option>
                </select>
              </label>
            </div>
          </div>
          
          <div className="analytics-inventory-alerts">
            <h3>Inventory Alerts - {forecastHorizon === "7d" ? "Next 7 Days" : forecastHorizon === "30d" ? "Next 30 Days" : "Next 90 Days"}</h3>
            <p>Date Range: {getDateRange()}</p>
            <p>Shows forecasted demand based on {forecastHorizon} forecast.</p>
            {forecastData.length > 0 ? (
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
                  {forecastData.length > 0 ? (
                    Object.values(
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
                    )
                    .sort((a, b) => a.totalForecasted - b.totalForecasted) // Sort by demand (lowest first)
                    .map((item, idx) => {
                      const forecasted = Math.round(item.totalForecasted);
                      // Adjust thresholds based on forecast horizon
                      const lowThreshold = forecastHorizon === "7d" ? 10 : forecastHorizon === "30d" ? 50 : 100;
                      const outThreshold = forecastHorizon === "7d" ? 5 : forecastHorizon === "30d" ? 20 : 50;
                      
                      const status = forecasted <= outThreshold ? "Critical - Low Stock" : 
                                     forecasted <= lowThreshold ? "Warning - Monitor Stock" : 
                                     "Good";
                      const statusColor = forecasted <= outThreshold ? "red" : 
                                          forecasted <= lowThreshold ? "orange" : 
                                          "green";
                      
                      return (
                        <tr key={idx}>
                          <td>{item.product}</td>
                          <td>{item.category}</td>
                          <td>{forecasted.toLocaleString()} units</td>
                          <td style={{ color: statusColor, fontWeight: "bold" }}>
                            {status}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "20px" }}>
                        No forecast data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <p>No forecast data available for inventory alerts</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}