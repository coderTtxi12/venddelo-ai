'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RestaurantSchedule } from '@/lib/api/types';
import { resolveRestaurantOpenStatus } from '@/lib/restaurantScheduleHours';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import styles from './RestaurantOpenStatusBadge.module.css';

type RestaurantOpenStatusBadgeProps = {
  schedules: RestaurantSchedule[];
  services: RestaurantServiceType[];
};

export function RestaurantOpenStatusBadge({
  schedules,
  services,
}: RestaurantOpenStatusBadgeProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = useMemo(
    () => resolveRestaurantOpenStatus(schedules, services, now),
    [schedules, services, now],
  );

  const stateClass =
    status.state === 'open'
      ? styles.open
      : status.state === 'closed'
        ? styles.closed
        : styles.unknown;

  return (
    <div
      className={`${styles.badge} ${stateClass}`}
      role="status"
      aria-live="polite"
      aria-label={
        status.detail ? `${status.label}. ${status.detail}` : status.label
      }
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>{status.label}</span>
      {status.detail ? <span className={styles.detail}>{status.detail}</span> : null}
    </div>
  );
}
