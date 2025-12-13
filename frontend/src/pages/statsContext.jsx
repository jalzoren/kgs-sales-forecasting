// frontend/src/StatsContext.jsx
import React, { createContext, useState, useContext } from 'react';

const StatsContext = createContext();

export function StatsProvider({ children }) {
  const [stats, setStats] = useState({
    // Numeric values
    predictedSales: 0,
    actualSales: 0,
    forecastAccuracy: 0,
    inventoryAlertsCount: 0,
    variance: 0,
    
    // 🔒 DATE LABELS - CRITICAL for display persistence
    predictedSalesLabel: "Loading...",
    actualSalesLabel: "Loading...",
    forecastedOnDate: "N/A",
    
    // Tooltip data
    predictedSalesTooltip: "Predicted sales for the next 7 days",
    actualSalesTooltip: "Actual sales from the previous 7 days",
    forecastAccuracyTooltip: "Accuracy of forecast predictions",
    inventoryAlertsTooltip: "Items requiring immediate action",
    
    // Raw data for reference
    metrics: null
  });

  return (
    <StatsContext.Provider value={{ stats, setStats }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats() {
  const context = useContext(StatsContext);
  if (!context) {
    throw new Error('useStats must be used within StatsProvider');
  }
  return context;
}