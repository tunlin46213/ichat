import { useEffect, useState } from 'react';

/**
 * Re-renders every `intervalMs` and returns the current time, so time-based labels
 * ("typing…", "Active now", "5m ago") expire on their own.
 */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
