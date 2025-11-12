import "../css/Welcome.css";
import Welcomed from "/Welcomed.svg";
import { FaRegQuestionCircle } from "react-icons/fa";
import Swal from "sweetalert2";
export default function Welcome() {
  return (
    <div className="welcome-container">
      <br />

      <div className="left-section">
        <h1 className="welcome">Welcome, New User'ed</h1>
        <br />

        <h2 className="welcome-title">Get Started with Sales Forecasting</h2>
        <p>
          To unlock accurate sales predictions, you'll need to build your data
          history. Start by uploading your sales data.
        </p>
        <br />
        <p>
          You'll be able to generate forecasts once sufficient data is
          available.
        </p>

        <br />
        <div className="how-it-works">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              Swal.fire({
                title: "How Our Sales Forecasting System Works",
                html: `
        <div style="
          text-align:left; 
          max-height:60vh; 
          overflow-y:auto; 
          padding-right:10px; 
          font-size: 14px;
          line-height:1.5;
        ">
          <p><strong>Our AI-powered system helps you predict future sales and prevent stockouts by learning from your historical sales data. The more data you provide, the smarter it gets!</strong></p>

          <p><strong>What You Do:</strong></p>
          <ul>
            <li><strong>Upload Initial Data:</strong> Start with whatever sales history you have (CSV/Excel files from your POS system).</li>
            <li><strong>Daily/Weekly Updates:</strong> Continue uploading new sales data regularly.</li>
            <li><strong>Monitor Progress:</strong> Watch your data timeline grow in the dashboard.</li>
          </ul>

          <p><strong>What the System Does:</strong></p>
          <ul>
            <li>Validates your data format and quality.</li>
            <li>Builds a comprehensive sales history database.</li>
            <li>Prepares data for AI model training.</li>
          </ul>
        </div>
      `,
                showCloseButton: true,
                focusConfirm: false,
                confirmButtonText: "Understood",
                confirmButtonColor: "var(--accent)",

                width: "700px",
                margin: "20px",
                customClass: {
                  popup: "custom-swal-popup",
                },
              });
            }}
            className="how-it-works-link"
          >
            <h4 className="text-h4">
              How it works <FaRegQuestionCircle className="info-icon" />
            </h4>
          </a>
        </div>
      </div>
      <div className="right-section">
        <img src={Welcomed} alt="Welcome Illustration" />

        <button className="upload-btn">Upload File Now</button>
      </div>
    </div>
  );
}
