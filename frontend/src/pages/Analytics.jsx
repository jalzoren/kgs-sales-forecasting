// Analytics.jsx
import React from "react";
import "../css/Analytics.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";



export default function Analytics() {

    const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/api/hello")
      .then((response) => setMessage(response.data.message))
  }, []);
  
  const data = [
    { date: "Mon", actual: 1000, forecasted: 1200, future: 1500 },
    { date: "Tue", actual: 1500, forecasted: 1700, future: 2000 },
    { date: "Wed", actual: 2200, forecasted: 2500, future: 2800 },
    { date: "Thu", actual: 3000, forecasted: 3200, future: 3500 },
    { date: "Fri", actual: 3700, forecasted: 3900, future: 4200 },
    { date: "Sat", actual: 4500, forecasted: 4700, future: 5000 },
  ];

  const renderCircularChart = (label) => (
    <div className="circle-progress">
      <svg viewBox="0 0 36 36" className="circular-chart">
        <path
          className="circle-bg"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="circle"
          strokeDasharray="96, 100"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <text x="18" y="20.35" className="percentage">96.25%</text>
      </svg>
      <p className="metric-label">{label}</p>
    </div>
  );



  return (
    <div>
      <h2 className="titled">Analytics Page</h2>

       <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>{message}</h1>
    </div>
      <div className="analytics-container">
        {/* Tabs */}
        <div className="analytics-header">
          <div className="tab-buttons">
            <button className="tab active">Sales Performance</button>
            <button className="tab">Inventory Alerts</button>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-wrapper">
          <div className="filters">
            <select><option>Date Range</option></select>
            <select><option>Line Chart</option></select>
            <select><option>Next Week</option></select>
          </div>
        </div>

        {/* Metrics Box */}
        <div className="metrics-box">
          <div className="metrics-info">
            <p><strong>Date Generated:</strong></p>
            <p><strong>Forecast Period:</strong></p>
            <p><strong>Forecast Horizon:</strong></p>
            <p><strong>Model Used:</strong></p>
          </div>

          <div className="metrics-charts">
            {renderCircularChart("")}
            {renderCircularChart("")}
            {renderCircularChart("Forecast Accuracy")}
          </div>
             <div className="metrics-charts">
            {renderCircularChart("")}
            {renderCircularChart("")}
            {renderCircularChart("Forecast Accuracy")}
          </div>
             <div className="metrics-charts">
            {renderCircularChart("")}
            {renderCircularChart("")}
            {renderCircularChart("Forecast Accuracy")}
          </div>
        </div>

        {/* Line Chart */}
        <div className="chart-section">
          <LineChart width={900} height={350} data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="actual" stroke="#7cb305" strokeWidth={2} name="Actual Sales" />
            <Line type="monotone" dataKey="forecasted" stroke="var(--accent-lighter)" strokeWidth={2} name="Forecasted Sales" />
            <Line type="monotone" dataKey="future" stroke="var(--accent-light)" strokeWidth={2} name="Future Forecast" />
          </LineChart>
        </div>
      </div>
    </div>
  );
}
