import { useEffect, useState } from "react";

import { api } from "../api/client";

const NOTICE_AFTER_MS = 3000;

/**
 * Pings the backend on load. Render's free tier sleeps when idle, so if the ping
 * is slow we tell the user why instead of leaving them staring at a dead form.
 */
export function useServerWake(): boolean {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaking(true), NOTICE_AFTER_MS);
    api.health().catch(() => undefined).finally(() => {
      window.clearTimeout(timer);
      setWaking(false);
    });
    return () => window.clearTimeout(timer);
  }, []);
  return waking;
}
