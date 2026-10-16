import { useEffect, useState } from "react";

const SLOW_AFTER_S = 15;

/** Shown over the map while a plan is being built, with honest elapsed time rather than fake steps. */
export function LoadingOverlay() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="map-loading" role="status">
      <div>Finding truck routes and checking the forecast at every checkpoint… {seconds}s</div>
      {seconds >= SLOW_AFTER_S && <div className="muted small">Still working; the free server may be waking up (up to a minute).</div>}
    </div>
  );
}
