import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";

import Home from "./pages/Home";
import Data from "./pages/Data";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Login from "./pages/Login";

import "./App.css";

function App() {
  const location = useLocation();
  const path = location.pathname;

  // ✅ Show Navbar2 only for specific routes
  const showNavbar2 = ["/data", "/forecast", "/reports", "/analytics"].some(
    (route) => path.startsWith(route)
  );

  // ✅ Hide navbar for login and root
  const hideNavbar = path === "/" || path === "/login";

  console.log("PATH:", path, "showNavbar2:", showNavbar2, "hideNavbar:", hideNavbar);

  return (
    <>
      {/* ✅ Conditional Navbar rendering */}
      {!hideNavbar && (showNavbar2 ? <Navbar2 /> : <Navbar />)}

      <div className={`page-container ${hideNavbar ? "no-navbar" : ""}`}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Home />} />
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
