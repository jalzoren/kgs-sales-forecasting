// frontend/src/StatsContext.jsx
import React, { createContext, useState, useContext } from 'react';

const StatsContext = createContext();

export function StatsProvider({ children }) {
  const [stats, setStats] = useState({
    predictedSales: 0,
    actualSales: 0,
    forecastAccuracy: 0,
    inventoryAlertsCount: 0,
    variance: 0
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