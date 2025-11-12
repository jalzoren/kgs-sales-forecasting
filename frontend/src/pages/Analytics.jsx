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

export default function Analytics() {
  const data = [
    { date: "Mon", actual: 1000, forecasted: 1200, future: 1500 },
    { date: "Tue", actual: 1500, forecasted: 1700, future: 2000 },
    { date: "Wed", actual: 2200, forecasted: 2500, future: 2800 },
    { date: "Thu", actual: 3000, forecasted: 3200, future: 3500 },
    { date: "Fri", actual: 3700, forecasted: 3900, future: 4200 },
    { date: "Sat", actual: 4500, forecasted: 4700, future: 5000 },
  ];

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
        <text x="18" y="20.35" className="analytics-percentage">96.25%</text>
      </svg>
      <p className="analytics-metric-label">{label}</p>
    </div>
  );

  return (
    <div className="analytics-page-container">
      <h2 className="analytics-title">Analytics Page</h2>

      {/* Tabs */}
      <div className="analytics-tab-buttons">
        <button className="analytics-tab active">Sales Performance</button>
        <button className="analytics-tab">Inventory Alerts</button>
      </div>

      {/* Toolbar / Filters */}
      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <select><option>Date Range</option></select>
          <select><option>Chart Type</option></select>
          <select><option>Next Week</option></select>
        </div>
      </div>

      {/* Metrics Box */}
      <div className="analytics-metrics-box">
        <div className="analytics-metrics-info">
          <p><strong>Date Generated:</strong></p>
          <p><strong>Forecast Period:</strong></p>
          <p><strong>Forecast Horizon:</strong></p>
          <p><strong>Model Used:</strong></p>
        </div>
        <div className="analytics-metrics-charts">
          {renderCircularChart("")}
          {renderCircularChart("")}
          {renderCircularChart("Forecast Accuracy")}
        </div>
      </div>

      {/* Line Chart */}
      <div className="analytics-chart-section">
        <LineChart width={900} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c9d6e3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="actual" stroke="#41a7dd" strokeWidth={2} name="Actual Sales" />
          <Line type="monotone" dataKey="forecasted" stroke="#0a4174" strokeWidth={2} name="Forecasted Sales" />
          <Line type="monotone" dataKey="future" stroke="#bbc8d8" strokeWidth={2} name="Future Forecast" />
        </LineChart>
      </div>
    </div>
  );
}
