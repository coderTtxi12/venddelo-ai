'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './StatsTrendChart.module.css';

export type StatsTrendPoint = {
  label: string;
  current: number;
  previous: number;
};

const CURRENT = '#2563eb';
const PREVIOUS = '#94a3b8';

type StatsTrendChartProps = {
  data: StatsTrendPoint[];
  currentName: string;
  previousName: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  currentName,
  previousName,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string; value?: number }>;
  label?: string;
  currentName: string;
  previousName: string;
}) {
  if (!active || !payload?.length) return null;
  const current = payload.find((item) => item.dataKey === 'current')?.value ?? 0;
  const previous = payload.find((item) => item.dataKey === 'previous')?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>
        {currentName}: {current}
      </span>
      <span>
        {previousName}: {previous}
      </span>
    </div>
  );
}

export function StatsTrendChart({ data, currentName, previousName }: StatsTrendChartProps) {
  const hasValues = data.some((point) => point.current > 0 || point.previous > 0);
  if (!hasValues) {
    return <p className={styles.empty}>No hay pedidos cerrados en este periodo.</p>;
  }

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="statsCurrentFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CURRENT} stopOpacity={0.28} />
              <stop offset="95%" stopColor={CURRENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            content={<ChartTooltip currentName={currentName} previousName={previousName} />}
          />
          <Area
            type="monotone"
            dataKey="current"
            name={currentName}
            stroke={CURRENT}
            strokeWidth={2}
            fill="url(#statsCurrentFill)"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={previousName}
            stroke={PREVIOUS}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
