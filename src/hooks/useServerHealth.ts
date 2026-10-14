import { useEffect, useState } from 'react';
import { api } from '@/api';
import type { ServerHealth } from '@/api/types';

const POLL_MS = 30_000;

/** Polls GET /health (every 30 s and when the tab regains focus). `null` = first check pending. */
export function useServerHealth(): ServerHealth | null {
  const [health, setHealth] = useState<ServerHealth | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      void api.health().then((h) => {
        if (alive) setHealth(h);
      });
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return health;
}
