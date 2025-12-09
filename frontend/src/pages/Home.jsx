// frontend/src/pages/Home.jsx
import React, { useState, useEffect } from "react";
import "../css/Home.css";
import { GoScreenFull } from "react-icons/go";
import Swal from "sweetalert2";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import SessionManager from "../services/sessionManager";
import { useStats } from "./statsContext";

export default function Home() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState({
    salesFile: "",
    forecastFile: "",
    futureFile: "",
  });
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [categoryAccuracy, setCategoryAccuracy] = useState([]);
  const [chartType, setChartType] = useState("line");
  const [dayRange, setDayRange] = useState(7);
  const { setStats } = useStats();

  useEffect(() => {
    fetchDashboardData();
  }, [dayRange]);

  const fetchDashboardData = async () => {
    setLoading(true);

    Swal.fire({
      title: "Loading Dashboard...",
      html: `Fetching ${dayRange}-day forecast data`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      console.log(`📊 Home: Fetching ${dayRange}-day data (cached)...`);

      // ✅ Use SessionManager cache - instant if Navbar already loaded it!
      const response = await SessionManager.getDashboardData(dayRange, false);

      if (!response.success) {
        throw new Error(response.error || "Failed to load dashboard data");
      }

      // Store file info
      setFileInfo({
        salesFile: response.salesFile || "",
        forecastFile: response.forecastFile || "",
        futureFile: response.futureFile || "",
      });

      // Update global stats (for Navbar)
      if (response.stats) {
        setStats({
          predictedSales: response.stats.predictedSales || 0,
          actualSales: response.stats.actualSales || 0,
          forecastAccuracy: response.stats.forecastAccuracy || 0,
          inventoryAlertsCount: response.inventoryAlerts?.length || 0,
          variance: response.stats.variance || 0,
        });
      }

      // Set inventory alerts
      if (response.inventoryAlerts && response.inventoryAlerts.length > 0) {
        console.log("✅ Setting inventory alerts:", response.inventoryAlerts);
        setInventoryAlerts(response.inventoryAlerts);
      } else {
        setInventoryAlerts([]);
      }

      // Set category accuracy
      if (response.categoryAccuracy && response.categoryAccuracy.length > 0) {
        console.log("✅ Setting category accuracy:", response.categoryAccuracy);
        setCategoryAccuracy(response.categoryAccuracy);
      } else {
        setCategoryAccuracy([]);
      }

      // Format chart data
      const combined = response.combinedData || [];
      const formattedData = combined.map((item) => {
        let dateObj;
        try {
          dateObj = new Date(item.date);
        } catch {
          dateObj = new Date();
        }

        return {
          name: dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          date: item.date,
          actual: item.actual_revenue,
          forecasted: item.forecasted_revenue,
          future: item.future_revenue,
        };
      });

      console.log("✅ Formatted chart data:", formattedData.length, "points");
      setSalesData(formattedData);
      Swal.close();
      setLoading(false);
    } catch (err) {
      console.error("❌ Error fetching dashboard:", err);
      setSalesData([]);
      setInventoryAlerts([]);
      setCategoryAccuracy([]);
      setLoading(false);
      Swal.fire({
        icon: "error",
        title: "Error Loading Dashboard",
        text: err.message || "Failed to load dashboard data",
        confirmButtonColor: "#0a4174",
      });
    }
  };

  // Helper function for inventory alert colors
  const getAlertColor = (avgDailySales) => {
    if (avgDailySales > 50) return "#ff4d4f";
    if (avgDailySales > 20) return "#ffa940";
    return "#52c41a";
  };

  const getAlertPercentage = (avgDailySales) => {
    return Math.min(100, (avgDailySales / 100) * 100);
  };

  return (
    <div>
      <div className="dashboard">
        <div className="left-side">
          <div className="box sales-overview">
            <div className="box-header">
              <div className="title-header">
                <h3 className="title-home">
                  Sales Overview (Future: {dayRange} Days)
                </h3>
              </div>
              <div className="dropdowns">
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                >
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="area">Area Chart</option>
                </select>
                <select
                  value={dayRange}
                  onChange={(e) => setDayRange(parseInt(e.target.value))}
                >
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                </select>

                <a href="/analytics" className="arrow-link">
                  <GoScreenFull />
                </a>
              </div>
            </div>

            {/* File info section */}
            {!loading && salesData.length > 0 && (
              <div
                style={{
                  padding: "10px 20px",
                  fontSize: "12px",
                  color: "#666",
                  borderBottom: "1px solid #e8e8e8",
                }}
              >
                <div>
                  <strong>📁 Data Sources:</strong>
                </div>
                <div>• Actual Sales: Last 7 days from {fileInfo.salesFile}</div>
                <div>• Forecasted: 7 days from {fileInfo.forecastFile}</div>
                <div>
                  • Future Forecast: Next {dayRange} days from{" "}
                  {fileInfo.futureFile}
                </div>
              </div>
            )}

            {/* Chart Area */}
            <div className="chart-area">
              {loading ? (
                <div style={{ textAlign: "center", padding: "80px" }}>
                  Loading {dayRange}-day dashboard data...
                </div>
              ) : salesData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px" }}>
                  No sales data available. Please upload data and generate
                  forecasts.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  {chartType === "line" ? (
                    <LineChart
                      data={salesData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={90}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        interval={dayRange === 90 ? 6 : dayRange === 30 ? 2 : 0}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          value >= 1000000
                            ? `₱${(value / 1000000)
                                .toFixed(1)
                                .replace(".0", "")}M`
                            : value >= 1000
                            ? `₱${Math.round(value / 1000)}K`
                            : `₱${value.toLocaleString()}`
                        }
                        tick={{ fontSize: 12, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, "dataMax + 500000"]}
                      />
                      <Tooltip
                        formatter={(value) =>
                          value == null
                            ? "No data"
                            : `₱${Number(value).toLocaleString("en-PH")}`
                        }
                        labelFormatter={(label) => `Date: ${label}`}
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#16a34a"
                        strokeWidth={3}
                        dot={{ r: 6 }}
                        name="Actual Sales (Last 7 Days)"
                      />
                      <Line
                        type="monotone"
                        dataKey="forecasted"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        strokeDasharray="10 5"
                        dot={{ r: 6 }}
                        name="Forecasted (7 Days)"
                      />
                      <Line
                        type="monotone"
                        dataKey="future"
                        stroke="#1e40af"
                        strokeWidth={3}
                        strokeDasharray="5 5"
                        dot={{
                          r: dayRange === 7 ? 6 : dayRange === 30 ? 4 : 2,
                        }}
                        name={`Future Forecast (${dayRange} Days)`}
                      />
                    </LineChart>
                  ) : chartType === "bar" ? (
                    <BarChart
                      data={salesData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={90}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        interval={dayRange === 90 ? 6 : dayRange === 30 ? 2 : 0}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          value >= 1000000
                            ? `₱${(value / 1000000)
                                .toFixed(1)
                                .replace(".0", "")}M`
                            : value >= 1000
                            ? `₱${Math.round(value / 1000)}K`
                            : `₱${value.toLocaleString()}`
                        }
                        tick={{ fontSize: 12, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) =>
                          `₱${Number(value).toLocaleString("en-PH")}`
                        }
                      />
                      <Legend />
                      <Bar
                        dataKey="actual"
                        fill="#16a34a"
                        radius={[8, 8, 0, 0]}
                        name="Actual Sales (7 Days)"
                      />
                      <Bar
                        dataKey="forecasted"
                        fill="#60a5fa"
                        radius={[8, 8, 0, 0]}
                        name="Forecasted (7 Days)"
                      />
                      <Bar
                        dataKey="future"
                        fill="#1e40af"
                        radius={[8, 8, 0, 0]}
                        name={`Future (${dayRange} Days)`}
                      />
                    </BarChart>
                  ) : chartType === "area" ? (
                    <AreaChart
                      data={salesData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={90}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        interval={dayRange === 90 ? 6 : dayRange === 30 ? 2 : 0}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          value >= 1000000
                            ? `₱${(value / 1000000)
                                .toFixed(1)
                                .replace(".0", "")}M`
                            : value >= 1000
                            ? `₱${Math.round(value / 1000)}K`
                            : `₱${value.toLocaleString()}`
                        }
                        tick={{ fontSize: 12, fill: "#64748b" }}
                      />
                      <Tooltip
                        formatter={(value) =>
                          `₱${Number(value).toLocaleString("en-PH")}`
                        }
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="actual"
                        stroke="#16a34a"
                        fill="#bbf7d0"
                        name="Actual Sales"
                      />
                      <Area
                        type="monotone"
                        dataKey="forecasted"
                        stroke="#3b82f6"
                        fill="#bfdbfe"
                        name="Forecasted"
                      />
                      <Area
                        type="monotone"
                        dataKey="future"
                        stroke="#1e40af"
                        fill="#93c5fd"
                        name={`Future (${dayRange} Days)`}
                      />
                    </AreaChart>
                  ) : null}
                </ResponsiveContainer>
              )}
            </div>

            {/* Debug info */}
            {!loading && salesData.length > 0 && (
              <div
                style={{
                  padding: "10px 20px",
                  fontSize: "11px",
                  color: "#999",
                  borderTop: "1px solid #e8e8e8",
                }}
              >
                <strong>📊 Data Summary:</strong>
                <div>Total points: {salesData.length}</div>
                <div>
                  Actual data points:{" "}
                  {salesData.filter((d) => d.actual !== null).length} (always 7
                  days)
                </div>
                <div>
                  Forecasted data points:{" "}
                  {salesData.filter((d) => d.forecasted !== null).length}{" "}
                  (always 7 days)
                </div>
                <div>
                  Future data points:{" "}
                  {salesData.filter((d) => d.future !== null).length} (
                  {dayRange} days)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE - Inventory Alerts & Category Accuracy */}
        <div className="right-side">
          {/* Inventory Alerts */}
          <div className="box inventory-box">
            <div className="inv-header">
              <h3 className="inv-title">Inventory Alerts</h3>
              <a href="/analytics" className="inv-link">
                <GoScreenFull />
              </a>
            </div>

            <div className="inventory-alerts">
              {loading ? (
                <p className="inventory-empty">Loading alerts...</p>
              ) : inventoryAlerts.length === 0 ? (
                <p className="inventory-empty">No high-priority alerts</p>
              ) : (
                inventoryAlerts.map((alert, idx) => (
                  <div key={idx} className="inventory-item">
                    <div className="product-info">
                      <span className="product-name">{alert.productName}</span>
                      <span className="product-category">
                        {alert.category} • {alert.demandLevel}
                      </span>

                      {/* Progress bar under text */}
                      <div
                        className={`progress-bar ${
                          alert.demandLevel === "High" ? "high-demand" : ""
                        }`}
                      >
                        <div
                          className="progress-fill"
                          style={{
                            width: `${getAlertPercentage(alert.avgDailySales)}%`,
                            backgroundColor: getAlertColor(alert.avgDailySales),
                          }}
                        ></div>
                      </div>
                    </div>

                    <span className="value">{Math.round(alert.avgDailySales)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Category Accuracy Chart */}
          <div className="category-box">
            <div className="category-header">
              <h3 className="category-title">Category Accuracy</h3>
              <a href="/analytics" className="inv-link">
                <GoScreenFull />
              </a>
            </div>

            <div className="category-chart-area">
              {loading ? (
                <p className="category-empty">Loading categories...</p>
              ) : categoryAccuracy.length === 0 ? (
                <p className="category-empty">No category data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryAccuracy} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#555" }}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#555" }}
                      domain={[0, 100]}
                      label={{ value: "%", angle: -90, position: "insideLeft", fill: "#555", fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => `${value}%`}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #ddd" }}
                    />
                    <Bar
                      dataKey="accuracy"
                      fill="#52c41a"
                      radius={[6, 6, 0, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
      <br />
      <br />
    </div>
  );
}