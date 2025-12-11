// frontend/src/pages/Welcome.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../css/Welcome.css";
import Welcomed from "/Welcomed.svg";
import { FaRegQuestionCircle } from "react-icons/fa";
import Swal from "sweetalert2";
const API = import.meta.env.VITE_API_URL;

export default function Welcome() {
  const navigate = useNavigate();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const [userStatus, setUserStatus] = useState({
    hasData: false,
    hasModels: false,
    hasForecast: false,
    dataCount: 0,
    isProcessing: false
  });

  // Check user's current status
  useEffect(() => {
    checkUserStatus(true); // Pass true for initial load
    
    // Poll status every 5 seconds (but not on initial load)
    const interval = setInterval(() => {
      checkUserStatus(false);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const checkUserStatus = async (isInitial = false) => {
    try {
      const res = await fetch("${API}/api/data?polling=true", {
        credentials: "include",
      });
      
      if (!res.ok) {
        setUserStatus({
          hasData: false,
          hasModels: false,
          hasForecast: false,
          dataCount: 0,
          isProcessing: false
        });
        if (isInitial) setIsInitialLoad(false);
        return;
      }
      
      const uploads = await res.json();
      
      const hasData = uploads.length > 0;
      const dataCount = uploads.length;
      const hasModels = uploads.some(u => u.status === "Completed");
      const isProcessing = uploads.some(u => 
        u.status === "Preprocessing" || u.status === "Training"
      );
      
      // ✅ Check forecast with proper validation
      let hasForecast = false;
      try {
        const forecastRes = await fetch("${API}/api/forecast/history", {
          credentials: "include",
        });
        
        // Only consider it as "has forecast" if status is OK AND data is not empty
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          hasForecast = Array.isArray(forecastData) && forecastData.length > 0;
        } else {
          hasForecast = false;
        }
      } catch (err) {
        console.log("No forecast yet");
        hasForecast = false;
      }
      
      setUserStatus({ hasData, hasModels, hasForecast, dataCount, isProcessing });
      
      // ✅ Only redirect after initial load is complete and user has forecast
      if (!isInitial && hasForecast && !isProcessing) {
        navigate("/home");
      }
      
      if (isInitial) {
        setIsInitialLoad(false);
      }
      
    } catch (err) {
      console.error("Error checking user status:", err);
      setUserStatus({
        hasData: false,
        hasModels: false,
        hasForecast: false,
        dataCount: 0,
        isProcessing: false
      });
      if (isInitial) setIsInitialLoad(false);
    }
  };

  const handleUploadClick = () => {
    // Redirect to Data Management page for uploads
    navigate("/data");
  };

  const showHowItWorks = () => {
    Swal.fire({
      title: "How Our Sales Forecasting System Works",
      html: `
        <div style="text-align:left; max-height:60vh; overflow-y:auto; padding:0 20px; font-size: 14px; line-height:1.6;">
          <p><strong>🎯 Our Machine Learning powered system helps you predict future sales and prevent stockouts!</strong></p>
          
          <h4>📊 Step 1: Initial Setup (3 Years of Data)</h4>
          <ul>
            <li><strong>Upload Historical Data:</strong> We need at least 3 years of sales data to train accurate forecasting models.</li>
            <li><strong>Why 3 years?</strong> This captures seasonal patterns, trends, and business cycles.</li>
            <li><strong>Format:</strong> CSV or Excel files from your POS system.</li>
            <li><strong>Required Columns:</strong> date, product_id, product_name, category, quantity, unit_price, discount, total_amount</li>
          </ul>
          
          <h4>🤖 Step 2: Machine Learning Training (Automatic)</h4>
          <ul>
            <li>Our Machine Learning Models analyzes your historical sales patterns.</li>
            <li>Trains forecasting models for each product (one model per product).</li>
            <li>Takes 10-30 minutes depending on data size.</li>
            <li>You'll receive notifications when training is complete.</li>
          </ul>
          
          <h4>📈 Step 3: Generate Forecasts (Weekly Updates)</h4>
          <ul>
            <li><strong>Upload Weekly Data:</strong> After training, upload your latest weekly sales data.</li>
            <li><strong>Get Predictions:</strong> Receive 7-day, 30-day, and 90-day forecasts for each product.</li>
            <li><strong>View Dashboard:</strong> Access insights, analytics, and inventory alerts.</li>
            <li><strong>Download Reports:</strong> Get Excel and PDF reports of your forecasts.</li>
          </ul>
          
          <h4>🔄 Step 4: Keep It Updated</h4>
          <ul>
            <li>Upload new sales data weekly for best accuracy.</li>
            <li>System learns and improves over time.</li>
            <li>Always have up-to-date forecasts!</li>
          </ul>
          
          <h4>📋 Data Management Tips</h4>
          <ul>
            <li><strong>CSV files upload faster</strong> than Excel files.</li>
            <li>Ensure your data follows the required format.</li>
            <li>Upload one year at a time (e.g., 2022, 2023, 2024).</li>
            <li>You can view and delete uploaded files in Data Management.</li>
          </ul>
          
          <p><strong>💡 Tip:</strong> The more consistent your data uploads, the more accurate your forecasts become!</p>
        </div>
      `,
      showCloseButton: true,
      confirmButtonText: "I Understand",
      confirmButtonColor: "var(--accent)",
      width: "750px",
    });
  };

  return (
    <div className="welcome-container">
      <div className="left-section">
        <h1 className="welcome">Welcome to Sales Forecasting! 👋</h1>
        <br />

        {/* Dynamic content based on user status */}
        {!userStatus.hasData && !userStatus.isProcessing && (
          <>
            <h2 className="welcome-title">Get Started with Machine Learning-Powered Predictions</h2>
            <p>
              To unlock accurate sales forecasts, we need to build your data history first. 
              Upload <strong>3 years of historical sales data</strong> to train your forecasting models.
            </p>
            <br />
            <p>
              Once training is complete, you'll be able to generate weekly forecasts and access your dashboard!
            </p>
          </>
        )}

        {userStatus.isProcessing && (
          <>
            <h2 className="welcome-title">⚙️ Processing Your Data...</h2>
            <p>
              We're analyzing your sales history and training forecasting models. 
              This may take 10-30 minutes depending on your data size.
            </p>
            <br />
            <p>
              <strong>Files uploaded:</strong> {userStatus.dataCount} file(s)
            </p>
            <br />
            <p>
              💡 You can safely navigate to other pages. We'll notify you when it's ready!
            </p>
          </>
        )}

        {userStatus.hasModels && !userStatus.hasForecast && (
          <>
            <h2 className="welcome-title">✅ Models Ready!</h2>
            <p>
              Great news! Your forecasting models have been trained successfully.
            </p>
            <br />
            <p>
              <strong>Next Step:</strong> Upload your <strong>weekly sales data</strong> to generate forecasts 
              and unlock your dashboard.
            </p>
          </>
        )}

        <br />
        <div className="how-it-works">
          <a href="#" onClick={(e) => { e.preventDefault(); showHowItWorks(); }} className="how-it-works-link">
            <h4 className="text-h4">
              How it works <FaRegQuestionCircle className="info-icon" />
            </h4>
          </a>
        </div>

        {/* Upload button - redirects to Data Management */}
        <button 
          className="upload-btn" 
          onClick={handleUploadClick}
          disabled={userStatus.isProcessing}
          style={{ 
            opacity: userStatus.isProcessing ? 0.6 : 1,
            cursor: userStatus.isProcessing ? 'not-allowed' : 'pointer'
          }}
        >
          {!userStatus.hasData 
            ? "📁 Upload Historical Data (3 Years)" 
            : userStatus.hasModels 
              ? "📊 Upload Weekly Sales Data" 
              : "⏳ Processing... Check Data Page"}
        </button>

        {/* Additional info */}
        {userStatus.hasData && (
          <p style={{ marginTop: "15px", fontSize: "14px", color: "#666", textAlign: "center" }}>
            View your uploaded files in <a href="/data" style={{ color: "var(--accent)", textDecoration: "underline" }}>Data Management</a>
          </p>
        )}
      </div>

      <div className="right-section">
        <img src={Welcomed} alt="Welcome Illustration" />
      </div>
    </div>
  );
}