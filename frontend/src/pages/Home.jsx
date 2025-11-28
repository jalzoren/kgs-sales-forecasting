// frontend/src/pages/Home.jsx
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

  const [chartType, setChartType] = useState("line");

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
              <div className="title-header">
              <h3 className="title-home">Sales Overview</h3>
             <i><GoScreenFull /></i> 


              </div>
              <div className="dropdowns">
                <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
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
    <div style={{ textAlign: 'center', padding: '80px' }}>Loading dashboard data...</div>
  ) : salesData.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '80px' }}>
      No sales data available. Please upload data and generate forecasts.
    </div>
  ) : (
    <>
      {/* Add this state at the top with your other useState */}
      {/* const [chartType, setChartType] = useState("line"); */}

      {/* Add onChange to your first dropdown */}
      {/* <select value={chartType} onChange={(e) => setChartType(e.target.value)}> */}

      <ResponsiveContainer width="100%" height={420}>
        {chartType === "line" ? (
          <LineChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={90}
              tick={{ fontSize: 12, fill: '#64748b' }}
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

            <Line type="monotone" dataKey="actual" stroke="#16a34a" strokeWidth={4} dot={{ r: 6 }} name="Actual Sales" />
            <Line type="monotone" dataKey="forecasted" stroke="#3b82f6" strokeWidth={4} strokeDasharray="10 5" dot={{ r: 6 }} name="Forecasted" />
            <Line type="monotone" dataKey="future" stroke="#1e40af" strokeWidth={4} strokeDasharray="5 5" dot={{ r: 6 }} name="Future Forecast" />
          </LineChart>
        ) : (
          <BarChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={90}
              tick={{ fontSize: 12, fill: '#64748b' }}
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

            <Bar dataKey="actual" fill="#16a34a" radius={[8, 8, 0, 0]} name="Actual Sales" />
            <Bar dataKey="forecasted" fill="#60a5fa" radius={[8, 8, 0, 0]} name="Forecasted" />
            <Bar dataKey="future" fill="#1e40af" radius={[8, 8, 0, 0]} name="Future Forecast" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </>
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
