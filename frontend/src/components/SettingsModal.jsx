// frontend/src/components/SettingsModal.jsx
import { useState } from "react";
import { IoClose } from "react-icons/io5";
import "./components-css/SettingsModal.css";

function SettingsModal({ isOpen, onClose }) {
  const [settings, setSettings] = useState({
    notifications: true,
    emailAlerts: true,
    darkMode: false,
    autoSave: true,
  });

  if (!isOpen) return null;

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={onClose}>
            <IoClose />
          </button>
        </div>
        
        <div className="settings-content">
          <div className="setting-item">
            <span>Enable Notifications</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.notifications}
                onChange={() => handleToggle('notifications')}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Email Alerts</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.emailAlerts}
                onChange={() => handleToggle('emailAlerts')}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Dark Mode</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.darkMode}
                onChange={() => handleToggle('darkMode')}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Auto-Save Data</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={settings.autoSave}
                onChange={() => handleToggle('autoSave')}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;