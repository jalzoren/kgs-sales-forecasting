// frontend/src/components/Navbar2.jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FaBullseye } from "react-icons/fa";
import { IoSettingsOutline } from "react-icons/io5";
import NotificationBell from "./NotificationBell";
import SettingsModal from "./SettingsModal";
import UserMenu from "./UserMenu";
import "./components-css/Navbar2.css";
import "./components-css/Navbar.css"; // Import Navbar.css for shared styles

function Navbar2() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <nav className="navbar2">
      <div className="navbar2-top">
        <div className="logo">
          <FaBullseye className="logo-icon" />
          <span className="logo-text">Sales Forecasting System</span>
        </div>

        <ul className="navbar2-links">
          <li><NavLink to="/home">Home</NavLink></li>
          <li><NavLink to="/data">Data</NavLink></li>
          <li><NavLink to="/forecast">Forecast</NavLink></li>
          <li><NavLink to="/analytics">Analytics</NavLink></li>
        </ul>

         <div className="navbar2-right">
          <NotificationBell />
          
          <button 
            className="settings" 
            onClick={() => setIsSettingsOpen(true)}
          >
            <IoSettingsOutline />
          </button>

          <UserMenu />
        </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </nav>
  );
}

export default Navbar2;