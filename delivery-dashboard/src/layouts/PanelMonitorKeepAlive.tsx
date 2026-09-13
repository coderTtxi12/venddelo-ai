'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import MonitorPage from '@/components/pages/MonitorPage';
import styles from './PanelMonitorKeepAlive.module.css';

/**
 * Keeps the monitor (and its Google Map) mounted after the first visit to /monitor,
 * so navigating away and back does not bill another Dynamic Maps load.
 */
export function PanelMonitorKeepAlive({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onMonitor = pathname === '/monitor';
  const [monitorVisited, setMonitorVisited] = useState(onMonitor);

  useEffect(() => {
    if (onMonitor) setMonitorVisited(true);
  }, [onMonitor]);

  return (
    <>
      {monitorVisited ? (
        <div
          className={onMonitor ? styles.visible : styles.hidden}
          aria-hidden={!onMonitor}
          inert={!onMonitor ? true : undefined}
        >
          <MonitorPage active={onMonitor} />
        </div>
      ) : null}
      {onMonitor ? null : children}
    </>
  );
}
