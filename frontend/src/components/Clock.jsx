import { useState, useEffect } from "react";
import dayjs from "dayjs";
import "../components/components-css/Clock.css";

function Clock() {
  const [time, setTime] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(dayjs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.format("HH:mm:ss");
  const formattedDay = time.format("dddd");
  const formattedDate = time.format("MMMM DD, YYYY");

  return (
    <div className="clock-container">
      <span>{formattedTime}</span>
      <span className="divider1"> | </span>
      <span>{formattedDay}</span>
      <span className="divider1"> | </span>
      <span>{formattedDate}</span>
    </div>
  );
}

export default Clock;
