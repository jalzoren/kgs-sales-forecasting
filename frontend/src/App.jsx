import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Navbar2 from "./components/Navbar2";

import Home from "./pages/Home";
import Data from "./pages/Data";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Login from "./pages/Login";
import Forgot from "./pages/Forgot";
import Register from "./pages/Register";
import Welcome from "./pages/Welcome";

import "./App.css";

function App() {
  const location = useLocation();
  const path = location.pathname;

  const hideNavbarPaths = ["/", "/login", "/register", "/forgot"];
  const showNavbar2Paths = ["/welcome"];

  const hideNavbar = hideNavbarPaths.includes(path);
  const showNavbar2 = showNavbar2Paths.includes(path);

  return (
    <>
      {!hideNavbar && (showNavbar2 ? <Navbar2 /> : <Navbar />)}

      <div className={`page-container ${hideNavbar ? "no-navbar" : ""}`}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/welcome" element={<Welcome />} />
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