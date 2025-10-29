import "../css/Welcome.css";
import Welcomed from "/Welcomed.svg";
import { FaRegQuestionCircle } from "react-icons/fa";
import Swal from "sweetalert2";
export default function Welcome() {
  return (
    
    <div className="welcome-container">
      <br/>
  
      <div className="left-section">
        <h1 className="welcome">Welcome, New User'ed</h1>
        <br />


        <h2 className="welcome-title">Get Started with Sales Forecasting</h2>
        <p>
          To unlock accurate sales predictions, you'll need to build your data
          history. Start by uploading your sales data.
        </p>
        <br/>
        <p>
          You'll be able to generate forecasts once sufficient data is
          available.
        </p>

        <br />
        <div className="how-it-works">
          <h4 className="text-h4">How it works </h4>
         <a
  className="how"
  href="#"
  onClick={(e) => {
    e.preventDefault();
    Swal.fire({
      title: "How it works",
      html: `
        <div style="text-align:left; max-height:60vh; overflow-y:auto; padding-right:10px;">
          <p><strong>1. Upload your data</strong><br>
          Upload CSV or Excel files with your sales history.</p>
          
          <p><strong>2. We analyze</strong><br>
          Our AI processes your data and detects patterns.</p>
          
          <p><strong>3. Get predictions</strong><br>
          View accurate sales forecasts for the next Week, 30/60/90 days.</p>
          
          <p><strong>4. Make decisions</strong><br>
          Use insights to optimize inventory, marketing, and growth.</p>
        </div>
      `,
      showCloseButton: true,
      focusConfirm: false,
      confirmButtonText: "Got it",
      width: "500px",
    });
  }}
>
  <FaRegQuestionCircle />
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
