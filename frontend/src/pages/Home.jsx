// frontend/src/pages/Home.jsx
import React, { useState, useEffect } from "react";
import "../css/Home.css";
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
} from "recharts";

export default function Home() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState({
    salesFile: '',
    forecastFile: '',
    futureFile: ''
  });

  useEffect(() => {
    setLoading(true);

    Swal.fire({
      title: 'Loading Dashboard...',
      html: 'Fetching your sales data and forecasts',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    fetch("http://localhost:5000/api/home/dashboard", { 
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
        
        if (!response.success) {
          throw new Error(response.error || "Failed to load dashboard data");
        }

        // Get the combined data from backend
        const combined = response.combinedData || [];
        
        console.log("📈 Combined data received:", combined.length, "items");
        console.log("📂 Files:", {
          sales: response.salesFile,
          forecast: response.forecastFile,
          future: response.futureFile
        });

        // Store file info
        setFileInfo({
          salesFile: response.salesFile || '',
          forecastFile: response.forecastFile || '',
          futureFile: response.futureFile || ''
        });

        // Format data for the chart
        const formattedData = combined.map((item) => {
          // Parse date
          let dateObj;
          try {
            dateObj = new Date(item.date);
          } catch {
            dateObj = new Date();
          }

          return {
            name: dateObj.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            }),
            date: item.date,
            actual: item.actual_revenue,
            forecasted: item.forecasted_revenue,
            future: item.future_revenue,
          };
        });

        console.log("✅ Formatted chart data:", formattedData.length, "points");
        console.log("📊 Sample data point:", formattedData[0]);
        
        setSalesData(formattedData);
        Swal.close();
        setLoading(false);
      })
      .catch(err => {
        console.error("❌ Error fetching dashboard:", err);
        setSalesData([]);
        setLoading(false);
        Swal.fire({
          icon: 'error',
          title: 'Error Loading Dashboard',
          text: err.message || 'Failed to load dashboard data',
          confirmButtonColor: '#0a4174'
        });
      });
  }, []);

  // Static inventory & category data
  const inventoryData = [
    { name: "Buldak", value: 19, color: "#ff4d4f" },
    { name: "Kimchi", value: 48, color: "#ffa940" },
    { name: "Banana Milk", value: 82, color: "#52c41a" },
  ];

  const categoryData = [
    { name: "Perishable", accuracy: 80 },
    { name: "Frozen Feed", accuracy: 75 },
    { name: "Beverages", accuracy: 78 },
    { name: "Shelf Stable", accuracy: 90 },
  ];

  return (
    <div>
      <div className="dashboard">
        <div className="left-side">
          <div className="box sales-overview">
            <div className="box-header">
              <h3>Sales Overview</h3>
              <div className="dropdowns">
                <select>
                  <option>Line Chart</option>
                  <option>Bar Chart</option>
                </select>
                <select>
                  <option>All Weeks</option>
                  <option>Last 4 Weeks</option>
                  <option>Last 2 Weeks</option>
                </select>
                <a href="/analytics" className="arrow-link">↗</a>
              </div>
            </div>

            {/* Show file info */}
            {!loading && salesData.length > 0 && (
              <div style={{ 
                padding: '10px 20px', 
                fontSize: '12px', 
                color: '#666',
                borderBottom: '1px solid #e8e8e8'
              }}>
                <div><strong>📁 Data Sources:</strong></div>
                <div>• Actual Sales: {fileInfo.salesFile}</div>
                <div>• Forecasted: {fileInfo.forecastFile}</div>
                <div>• Future Forecast: {fileInfo.futureFile}</div>
              </div>
            )}

            <div className="chart-area">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                  <p>Loading dashboard data...</p>
                </div>
              ) : salesData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                  <p>No sales data available. Please upload sales data and generate forecasts.</p>
                </div>
              ) : (
                <LineChart width={970} height={400} data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    height={100} 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} 
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(v, name) => {
                      if (v === null || v === undefined) return ['No data', name];
                      return [`₱${v.toLocaleString()}`, name];
                    }}
                    labelFormatter={l => `Date: ${l}`} 
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                  
                  {/* Actual Sales - Green (solid line) */}
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    stroke="#52c41a" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: "#52c41a", strokeWidth: 2, stroke: "#fff" }} 
                    name="Actual Sales (Week 2)" 
                    connectNulls={false}
                  />
                  
                  {/* Forecasted Sales - Blue (dashed) - Week 1 predicting Week 2 */}
                  <Line 
                    type="monotone" 
                    dataKey="forecasted" 
                    stroke="#1890ff" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: "#1890ff", strokeWidth: 2, stroke: "#fff" }} 
                    name="Forecasted (Week 1 → 2)" 
                    connectNulls={false} 
                    strokeDasharray="8 4" 
                  />
                  
                  {/* Future Forecast - Dark Blue (dashed) - Week 2 predicting Week 3 */}
                  <Line 
                    type="monotone" 
                    dataKey="future" 
                    stroke="#003a8c" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: "#003a8c", strokeWidth: 2, stroke: "#fff" }} 
                    name="Future Forecast (Week 2 → 3)" 
                    connectNulls={false} 
                    strokeDasharray="3 3" 
                  />
                </LineChart>
              )}
            </div>

            {/* Debug info - remove this in production */}
            {!loading && salesData.length > 0 && (
              <div style={{ 
                padding: '10px 20px', 
                fontSize: '11px', 
                color: '#999',
                borderTop: '1px solid #e8e8e8'
              }}>
                <strong>📊 Data Summary:</strong>
                <div>Total points: {salesData.length}</div>
                <div>Actual data points: {salesData.filter(d => d.actual !== null).length}</div>
                <div>Forecasted data points: {salesData.filter(d => d.forecasted !== null).length}</div>
                <div>Future data points: {salesData.filter(d => d.future !== null).length}</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="right-side">
          <div className="box inventory-box">
            <div className="box-header">
              <h3>Inventory Alerts</h3>
              <a href="/analytics" className="view-all">View All ↗</a>
            </div>
            <div className="inventory-alerts">
              {inventoryData.map((item, idx) => (
                <div key={idx} className="inventory-item">
                  <span>{item.name}</span>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ 
                        width: `${item.value}%`, 
                        backgroundColor: item.color 
                      }}
                    ></div>
                  </div>
                  <span className="value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="box category-box">
            <div className="box-header">
              <h3>Category Accuracy</h3>
              <a href="/analytics" className="view-all">View All ↗</a>
            </div>
            <div className="chart-area">
              <BarChart width={320} height={200} data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar 
                  dataKey="accuracy" 
                  fill="#52c41a" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </div>
          </div>
        </div>
      </div>
      <br /><br />
    </div>
  );
}
