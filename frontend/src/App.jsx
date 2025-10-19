import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";

import Home from "./pages/Home";
import Data from "./pages/Data";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import "./App.css"; // new global layout styles

function App() {
  const location = useLocation();
  const path = location.pathname;

  const useSmallNavbar = ["/data", "/forecast", "/reports", "/analytics"].includes(path);

  // Dynamically set CSS variable for navbar height
  document.documentElement.style.setProperty(
    "--navbar-height",
    useSmallNavbar ? "80px" : "300px"
  );

  return (
    <>
      {useSmallNavbar ? <Navbar2 /> : <Navbar />}

      <div className="page-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/data" element={<Data />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
