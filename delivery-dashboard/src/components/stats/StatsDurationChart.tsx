'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DURATION_METRICS, formatDuration } from '@/lib/dispatch/statsView';
import styles from './StatsDurationChart.module.css';

export type StatsDurationPoint = {
  label: string;
  total: number | null;
  search: number | null;
  delivery: number | null;
  pickup: number | null;
  dropoff: number | null;
};

type StatsDurationChartProps = {
  data: StatsDurationPoint[];
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      {payload.map((item) => {
        const metric = DURATION_METRICS.find((row) => row.key === item.dataKey);
        if (!metric || item.value == null || !Number.isFinite(item.value)) return null;
        return (
          <span key={metric.key}>
            {metric.label}: {formatDuration(Math.round(item.value * 60))}
          </span>
        );
      })}
    </div>
  );
}

export function StatsDurationChart({ data }: StatsDurationChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visible = DURATION_METRICS.filter((metric) => !hidden.has(metric.key));
  const hasValues = data.some((point) =>
    visible.some((metric) => {
      const value = point[metric.key];
      return value != null && Number.isFinite(value);
    }),
  );

  return (
    <>
      <div className={styles.legend} role="group" aria-label="Métricas de tiempo">
        {DURATION_METRICS.map((metric) => {
          const pressed = !hidden.has(metric.key);
          return (
            <button
              key={metric.key}
              type="button"
              className={styles.toggle}
              aria-pressed={pressed}
              onClick={() => toggle(metric.key)}
            >
              <span className={styles.swatch} style={{ ['--swatch' as string]: metric.color }} aria-hidden />
              {metric.label}
            </button>
          );
        })}
      </div>
      {visible.length === 0 || !hasValues ? (
        <p className={styles.empty}>No hay entregas con tiempos en este periodo.</p>
      ) : (
        <div className={styles.wrap}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
              {visible.map((metric) => (
                <Line
                  key={metric.key}
                  type="monotone"
                  dataKey={metric.key}
                  name={metric.label}
                  stroke={metric.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
