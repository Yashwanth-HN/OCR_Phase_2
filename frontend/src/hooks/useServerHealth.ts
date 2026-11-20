import { useEffect, useState } from 'react';
import { api } from '@/api';
import type { ServerHealth } from '@/api/types';

const ONLINE_POLL_MS = 30_000;
/** Re-check soon after a failure: a backend that scales to zero (or restarts) is back within seconds. */
const OFFLINE_POLL_MS = 5_000;
/** Show "Connecting…" (not "offline") for this many retries in a row, about a minute: a cold start can take that long. */
const WAKING_RETRIES = 12;

/**
 * Polls GET /health: every 30 s while online, every 5 s while not, and when the tab regains focus.
 * `null` = checking (the first check, or retrying while the server wakes up).
 */
export function useServerHealth(): ServerHealth | null {
  const [health, setHealth] = useState<ServerHealth | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    let inFlight = false;
    let failures = 0;

    const check = () => {
      if (inFlight) return;
      inFlight = true;
      window.clearTimeout(timer);
      if (failures > 0 && failures <= WAKING_RETRIES) setHealth(null);
      void api.health().then((h) => {
        inFlight = false;
        if (!alive) return;
        failures = h.online ? 0 : failures + 1;
        // While still within the waking window keep showing "Connecting…" instead of flashing "offline".
        setHealth(h.online || failures > WAKING_RETRIES ? h : null);
        timer = window.setTimeout(check, h.online ? ONLINE_POLL_MS : OFFLINE_POLL_MS);
      });
    };

    check();
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return health;
}
