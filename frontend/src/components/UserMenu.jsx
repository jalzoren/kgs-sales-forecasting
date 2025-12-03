// frontend/src/components/UserMenu.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LiaUserCircle } from "react-icons/lia";
import { FiUser, FiLogOut } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";
import Swal from "sweetalert2";
import "./components-css/UserMenu.css";

function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [userName, setUserName] = useState("User Name");
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Fetch user info from session
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch("http://localhost:5000/check-session", {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();
        
        console.log("User session data:", data); // Debug log

        if (data.loggedIn && data.user) {
          const fullName = `${data.user.firstName} ${data.user.lastName}`;
          setUserName(fullName);
        } else {
          setUserName("User Name");
        }
      } catch (error) {
        console.error("Failed to fetch user info:", error);
        setUserName("User Name");
      }
    };

    fetchUserInfo();
  }, []); // Run once on mount

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
        fetch("http://localhost:5000/logout", {
          method: "POST",
          credentials: "include",
        })
          .then(() => {
            Swal.fire({
              icon: "success",
              title: "Logged out successfully!",
              showConfirmButton: false,
              timer: 1000,
            }).then(() => navigate("/"));
          })
          .catch((err) => console.error("Logout failed:", err));
      }
    });
  };

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button 
        className="user-btn glass" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <LiaUserCircle className="user-icon" />
        <span className="user-name">{userName}</span>
        <IoChevronDown className={`chevron ${isOpen ? "rotate" : ""}`} />
      </button>

      {isOpen && (
        <div className="user-dropdown glass">
          <button className="dropdown-item" onClick={() => navigate("/profile")}>
            <FiUser /> Profile
          </button>
          <button className="dropdown-item logout" onClick={handleLogout}>
            <FiLogOut /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;