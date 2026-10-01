import { useEffect, useState } from 'react';

/** Re-render menu visibility on minute boundaries when schedule filtering is active. */
export function useMenuScheduleNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
}
