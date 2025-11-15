import React from "react";
import "../css/LoadingOverlay.css";

export default function LoadingOverlay({ message = "Loading..." }) {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="spinner-container">
          <div className="spinner"></div>
        </div>
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
}

