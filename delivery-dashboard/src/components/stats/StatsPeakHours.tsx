'use client';

import { useMemo, useState } from 'react';
import type { DispatchStatsHourCell } from '@/lib/api/types';
import { hourBucketRange } from '@/lib/dispatch/statsView';
import styles from './StatsPeakHours.module.css';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type StatsPeakHoursProps = {
  cells: DispatchStatsHourCell[];
  singleDay: boolean;
};

type PeakSelection = {
  hour: number;
  weekday: number | null;
  count: number;
};

function PeakHourDetail({ selection }: { selection: PeakSelection }) {
  const day = selection.weekday == null ? '' : `${WEEKDAYS[selection.weekday]} · `;
  const countLabel = selection.count === 1 ? 'solicitud' : 'solicitudes';
  return (
    <p className={styles.detail} role="status">
      <strong>
        {day}
        {hourBucketRange(selection.hour)}
      </strong>
      <span>
        {' · '}
        {selection.count} {countLabel}
      </span>
    </p>
  );
}

export function StatsPeakHours({ cells, singleDay }: StatsPeakHoursProps) {
  const max = Math.max(0, ...cells.map((cell) => cell.count));
  const hours = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: cells.filter((cell) => cell.hour === hour).reduce((sum, cell) => sum + cell.count, 0),
      })),
    [cells],
  );
  const peak = useMemo<PeakSelection>(() => {
    if (singleDay) {
      const best = hours.reduce((current, row) => (row.count > current.count ? row : current), hours[0]);
      return { hour: best?.hour ?? 0, weekday: null, count: best?.count ?? 0 };
    }
    const best = cells.reduce((current, cell) => (cell.count > current.count ? cell : current), cells[0]);
    return {
      hour: best?.hour ?? 0,
      weekday: best?.weekday ?? 0,
      count: best?.count ?? 0,
    };
  }, [cells, hours, singleDay]);
  const [picked, setPicked] = useState<{ hour: number; weekday: number | null } | null>(null);
  const selectedKey = picked ?? { hour: peak.hour, weekday: peak.weekday };
  const selectedCount =
    selectedKey.weekday == null
      ? (hours.find((row) => row.hour === selectedKey.hour)?.count ?? 0)
      : (cells.find((cell) => cell.hour === selectedKey.hour && cell.weekday === selectedKey.weekday)
          ?.count ?? 0);
  const selected: PeakSelection = {
    hour: selectedKey.hour,
    weekday: selectedKey.weekday,
    count: selectedCount,
  };

  if (max <= 0) {
    return <p className={styles.empty}>No hay solicitudes en este periodo.</p>;
  }

  if (singleDay) {
    return (
      <div className={styles.wrap}>
        <PeakHourDetail selection={selected} />
        <ul className={styles.bars}>
          {hours.map((row) => {
            const isSelected = selected.weekday == null && selected.hour === row.hour;
            return (
              <li key={row.hour}>
                <button
                  type="button"
                  className={`${styles.barButton} ${isSelected ? styles.barButtonSelected : ''}`}
                  aria-pressed={isSelected}
                  aria-label={`${hourBucketRange(row.hour)}, ${row.count} ${
                    row.count === 1 ? 'solicitud' : 'solicitudes'
                  }`}
                  onClick={() => setPicked({ hour: row.hour, weekday: null })}
                  onFocus={() => setPicked({ hour: row.hour, weekday: null })}
                >
                  <span className={styles.barLabel}>{String(row.hour).padStart(2, '0')}:00</span>
                  <span className={styles.barTrack}>
                    <span
                      className={styles.barFill}
                      style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                    />
                  </span>
                  <span className={styles.barValue}>{row.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PeakHourDetail selection={selected} />
      <div className={styles.heatWrap}>
        <table className={styles.heat}>
          <caption className={styles.caption}>Solicitudes por hora y día. Toca una celda para ver el rango.</caption>
          <thead>
            <tr>
              <th>Hora</th>
              {WEEKDAYS.map((day) => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, hour) => (
              <tr key={hour}>
                <th scope="row">{String(hour).padStart(2, '0')}</th>
                {WEEKDAYS.map((day, weekday) => {
                  const count =
                    cells.find((cell) => cell.weekday === weekday && cell.hour === hour)?.count ?? 0;
                  const intensity = count / max;
                  const isSelected = selected.weekday === weekday && selected.hour === hour;
                  return (
                    <td key={`${weekday}-${hour}`} className={styles.heatCell}>
                      <button
                        type="button"
                        className={`${styles.heatButton} ${isSelected ? styles.heatButtonSelected : ''}`}
                        aria-pressed={isSelected}
                        aria-label={`${day} ${hourBucketRange(hour)}, ${count} ${
                          count === 1 ? 'solicitud' : 'solicitudes'
                        }`}
                        style={{
                          background: `color-mix(in srgb, #2563eb ${Math.round(intensity * 72)}%, #f8fafc)`,
                        }}
                        onClick={() => setPicked({ hour, weekday })}
                        onFocus={() => setPicked({ hour, weekday })}
                      >
                        {count}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
