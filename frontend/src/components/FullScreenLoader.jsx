// frontend/src/components/FullScreenLoader.jsx
import "../components/components-css/FullScreenLoader.css";

export default function FullScreenLoader({ message = "Loading..." }) {
  return (
    <div className="loader-wrapper">
      <div className="loader-spinner"></div>
      <p className="loader-message">{message}</p>
    </div>
  );
}
