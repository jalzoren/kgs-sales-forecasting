// Home.jsx
import React from "react";
import "../css/Home.css";

export default function Home() {
  return (


    <div className="dashboard">
      <div className="box">
        <div className="box-header">
          <h3>Sales Overview</h3>
          <div className="dropdowns">
            <select>
              <option>Line Chart</option>
              <option>Bar Chart</option>
            </select>
            <select>
              <option>Next Week</option>
              <option>This Week</option>
            </select>
          </div>
        </div>
        <div className="box-content">
          <div className="placeholder">Graph Area</div>
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h3>Inventory Alerts</h3>
          <a href="#">View All ↗</a>
        </div>
        <div className="box-content">
          <div className="placeholder">Inventory Chart</div>
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h3>Category Accuracy</h3>
          <a href="#">View All ↗</a>
        </div>
        <div className="box-content">
          <div className="placeholder">Category Chart</div>
        </div>
      </div>
    </div>
  );
}
