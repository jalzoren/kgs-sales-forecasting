import { NavLink, useNavigate} from "react-router-dom";
import { FaBullseye, FaBell } from "react-icons/fa";
import { LiaUserCircle } from "react-icons/lia";

import "../css/Navbar2.css";
import Swal from "sweetalert2"; 

 

function Navbar2() {

  const navigate = useNavigate();

  const handleLogout = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You will be logged out!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0A4174",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, log out!",
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire(
          "Logged Out!",
          "You have been successfully logged out.",
          "success"
        ).then(() => {
          navigate("/");
        });
      }
    });
  };
  return (
    <nav className="navbar2">
      <div className="navbar2-top">
        <div className="logo">
          <FaBullseye className="logo-icon" />
          <span className="logo-text">Sales Forecasting System</span>
        </div>

        <ul className="navbar2-links">
          <li>
            <NavLink to="/home">Home</NavLink>
          </li>
          <li>
            <NavLink to="/data">Data</NavLink>
          </li>
          <li>
            <NavLink to="/forecast">Forecast</NavLink>
          </li>
          <li>
            <NavLink to="/reports">Reports</NavLink>
          </li>
          <li>
            <NavLink to="/analytics">Analytics</NavLink>
          </li>
        </ul>

        <div className="navbar2-right">
          <button className="icon-btn">
            <FaBell />
          </button>
           <button className="logout-btn" onClick={handleLogout}>
      <LiaUserCircle />
    </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar2;
