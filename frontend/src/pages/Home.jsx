import React from "react";
import "../css/Home.css";
 


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
  const salesData = [
    { name: "Mon", actual: 1000, forecasted: 1200, future: 1500 },
    { name: "Tue", actual: 1500, forecasted: 1700, future: 2000 },
    { name: "Wed", actual: 2200, forecasted: 2500, future: 2800 },
    { name: "Thu", actual: 3000, forecasted: 3200, future: 3500 },
    { name: "Fri", actual: 3700, forecasted: 3900, future: 4200 },
    { name: "Sat", actual: 4500, forecasted: 4700, future: 5000 },
  ];

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
                  <option>Next Week</option>
                  <option>This Week</option>
                </select>
                <a href="#" className="arrow-link">↗</a>
              </div>
            </div>
            <div className="chart-area">
              <LineChart width={970} height={440} data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="#7cb305" strokeWidth={2} name="Actual Sales" />
                <Line type="monotone" dataKey="forecasted" stroke="#69b1ff" strokeWidth={2} name="Forecasted Sales" />
                <Line type="monotone" dataKey="future" stroke="#003a8c" strokeWidth={2} name="Future Forecast" />
              </LineChart>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="right-side">
          <div className="box inventory-box">
            <div className="box-header">
              <h3>Inventory Alerts</h3>
              <a href="#" className="view-all">View All ↗</a>
            </div>
            <div className="inventory-alerts">

              {inventoryData.map((item, index) => (
                <div key={index} className="inventory-item">
                  <span>{item.name}</span>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${item.value}%`, backgroundColor: item.color }}
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
              <a href="#" className="view-all">View All ↗</a>
            </div>
            <div className="chart-area">
              <BarChart width={320} height={200} data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="accuracy" fill="#52c41a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </div>
          </div>
        </div>

      </div>
      <br/><br/>
  </div>
  );


}  
