// Update your Home.jsx component

import React, { useState, useEffect } from "react";
import "../css/Home.css";
import { GoScreenFull } from "react-icons/go";
import Swal from 'sweetalert2';
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
  ResponsiveContainer
} from "recharts";

export default function Home() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState({
    salesFile: '',
    forecastFile: '',
    futureFile: ''
  });
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [categoryAccuracy, setCategoryAccuracy] = useState([]);
  const [chartType, setChartType] = useState("line");
  const [dayRange, setDayRange] = useState(7); // New state for day range

  useEffect(() => {
    fetchDashboardData();
  }, [dayRange]); // Re-fetch when dayRange changes

  const fetchDashboardData = () => {
    setLoading(true);

    Swal.fire({
      title: 'Loading Dashboard...',
      html: `Fetching ${dayRange}-day forecast data`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    // Add days parameter to URL
    fetch(`http://localhost:5000/api/home/dashboard?days=${dayRange}`, { 
      credentials: "include" 
    })
      .then(res => {
        console.log("📡 Response status:", res.status);
        if (!res.ok) {
          if (res.status === 401) throw new Error("Please log in to view dashboard");
          throw new Error("Failed to fetch dashboard data");
        }
        return res.json();
      })
      .then(response => {
        console.log("📊 Full Dashboard Response:", response);
        console.log(`📅 Loaded ${response.days}-day view`);
        
        if (!response.success) {
          throw new Error(response.error || "Failed to load dashboard data");
        }

        // Store file info
        setFileInfo({
          salesFile: response.salesFile || '',
          forecastFile: response.forecastFile || '',
          futureFile: response.futureFile || ''
        });

        // Set inventory alerts
        if (response.inventoryAlerts && response.inventoryAlerts.length > 0) {
          console.log("✅ Setting inventory alerts:", response.inventoryAlerts);
          setInventoryAlerts(response.inventoryAlerts);
        } else {
          console.log("⚠️ No inventory alerts found");
          setInventoryAlerts([]);
        }

        // Set category accuracy
        if (response.categoryAccuracy && response.categoryAccuracy.length > 0) {
          console.log("✅ Setting category accuracy:", response.categoryAccuracy);
          setCategoryAccuracy(response.categoryAccuracy);
        } else {
          console.log("⚠️ No category accuracy data");
          setCategoryAccuracy([]);
        }

        // Format chart data from combinedData
        const combined = response.combinedData || [];
        const formattedData = combined.map((item) => {
          let dateObj;
          try {
            dateObj = new Date(item.date);
          } catch {
            dateObj = new Date();
          }

          return {
            name: dateObj.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric'
            }),
            date: item.date,
            actual: item.actual_revenue,
            forecasted: item.forecasted_revenue,
            future: item.future_revenue,
          };
        });

        console.log("✅ Formatted chart data:", formattedData.length, "points");
        console.log("   Actual data points:", formattedData.filter(d => d.actual !== null).length);
        console.log("   Forecasted points:", formattedData.filter(d => d.forecasted !== null).length);
        console.log("   Future points:", formattedData.filter(d => d.future !== null).length);
        
        setSalesData(formattedData);
        Swal.close();
        setLoading(false);
      })
      .catch(err => {
        console.error("❌ Error fetching dashboard:", err);
        setSalesData([]);
        setInventoryAlerts([]);
        setCategoryAccuracy([]);
        setLoading(false);
        Swal.fire({
          icon: 'error',
          title: 'Error Loading Dashboard',
          text: err.message || 'Failed to load dashboard data',
          confirmButtonColor: '#0a4174'
        });
      });
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
                <h3 className="title-home">Sales Overview (Future: {dayRange} Days)</h3>
                <i><GoScreenFull /></i>
              </div>
              <div className="dropdowns">
                <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                </select>
                {/* Updated dropdown for day ranges */}
                <select value={dayRange} onChange={(e) => setDayRange(parseInt(e.target.value))}>
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                </select>

                <a href="/analytics" className="arrow-link">↗</a>
              </div>
            </div>

            {/* File info section */}
            {!loading && salesData.length > 0 && (
              <div style={{ 
                padding: '10px 20px', 
                fontSize: '12px', 
                color: '#666',
                borderBottom: '1px solid #e8e8e8'
              }}>
                <div><strong>📁 Data Sources:</strong></div>
                <div>• Actual Sales: Last 7 days from {fileInfo.salesFile}</div>
                <div>• Forecasted: 7 days from {fileInfo.forecastFile}</div>
                <div>• Future Forecast: Next {dayRange} days from {fileInfo.futureFile}</div>
              </div>
            )}


            {/* Chart Area */}
            <div className="chart-area">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '80px' }}>
                  Loading {dayRange}-day dashboard data...
                </div>
              ) : salesData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px' }}>
                  No sales data available. Please upload data and generate forecasts.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  {chartType === "line" ? (
                    <LineChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={90}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={dayRange === 90 ? 6 : dayRange === 30 ? 2 : 0}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          value >= 1000000
                            ? `₱${(value / 1000000).toFixed(1).replace('.0', '')}M`
                            : value >= 1000
                            ? `₱${Math.round(value / 1000)}K`
                            : `₱${value.toLocaleString()}`
                        }
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 'dataMax + 500000']}
                      />
                      <Tooltip
                        formatter={(value) => value == null ? 'No data' : `₱${Number(value).toLocaleString('en-PH')}`}
                        labelFormatter={(label) => `Date: ${label}`}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />

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
                        name="Forecasted (7 Days)"  // Changed from {dayRange}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="future" 
                        stroke="#1e40af" 
                        strokeWidth={3} 
                        strokeDasharray="5 5" 
                        dot={{ r: dayRange === 7 ? 6 : dayRange === 30 ? 4 : 2 }} 
                        name={`Future Forecast (${dayRange} Days)`}
                      />
                    </LineChart>
                  ) : (
                    <BarChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={90}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={dayRange === 90 ? 6 : dayRange === 30 ? 2 : 0}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          value >= 1000000
                            ? `₱${(value / 1000000).toFixed(1).replace('.0', '')}M`
                            : value >= 1000
                            ? `₱${Math.round(value / 1000)}K`
                            : `₱${value.toLocaleString()}`
                        }
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip formatter={(value) => `₱${Number(value).toLocaleString('en-PH')}`} />
                      <Legend />

                      <Bar dataKey="actual" fill="#16a34a" radius={[8, 8, 0, 0]} name="Actual Sales (7 Days)" />
                      <Bar dataKey="forecasted" fill="#60a5fa" radius={[8, 8, 0, 0]} name="Forecasted (7 Days)" />
                      <Bar dataKey="future" fill="#1e40af" radius={[8, 8, 0, 0]} name={`Future (${dayRange} Days)`} />

                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            {/* Debug info */}
            {!loading && salesData.length > 0 && (
              <div style={{ 
                padding: '10px 20px', 
                fontSize: '11px', 
                color: '#999',
                borderTop: '1px solid #e8e8e8'
              }}>
                <strong>📊 Data Summary:</strong>
                <div>Total points: {salesData.length}</div>
                <div>Actual data points: {salesData.filter(d => d.actual !== null).length} (always 7 days)</div>
                <div>Forecasted data points: {salesData.filter(d => d.forecasted !== null).length} (always 7 days)</div>
                <div>Future data points: {salesData.filter(d => d.future !== null).length} ({dayRange} days)</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE - Inventory Alerts & Category Accuracy */}
        <div className="right-side">
          {/* Inventory Alerts */}
          <div className="box inventory-box">
            <div className="box-header">
              <h3>Inventory Alerts</h3>
              <a href="/analytics" className="view-all">View All ↗</a>
            </div>
            <div className="inventory-alerts">
              {loading ? (
                <p style={{ textAlign: 'center', padding: '20px' }}>Loading alerts...</p>
              ) : inventoryAlerts.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                  No high-priority alerts
                </p>
              ) : (
                inventoryAlerts.map((alert, idx) => (
                  <div key={idx} className="inventory-item">
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span style={{ fontWeight: 'bold' }}>{alert.productName}</span>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        {alert.category} • {alert.demandLevel}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ 
                          width: `${getAlertPercentage(alert.avgDailySales)}%`, 
                          backgroundColor: getAlertColor(alert.avgDailySales)
                        }}
                      ></div>
                    </div>
                    <span className="value">{Math.round(alert.avgDailySales)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Category Accuracy */}
          <div className="box category-box">
            <div className="box-header">
              <h3>Category Accuracy</h3>
              <a href="/analytics" className="view-all">View All ↗</a>
            </div>
            <div className="chart-area">
              {loading ? (
                <p style={{ textAlign: 'center', padding: '60px' }}>Loading categories...</p>
              ) : categoryAccuracy.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
                  No category data available
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryAccuracy}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 11 }} 
                      angle={-15}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      domain={[0, 100]}
                      label={{ value: '%', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar 
                      dataKey="accuracy" 
                      fill="#52c41a" 
                      radius={[4, 4, 0, 0]} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
      <br /><br />
    </div>
  );
}