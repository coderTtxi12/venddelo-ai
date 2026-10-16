'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  businessLinePoints,
  type BusinessOrderRow,
} from '@/lib/dispatch/businessOrders';
import styles from './StatsBusinessLines.module.css';

const ZERO_STROKE = '#cbd5e1';

type StatsBusinessLinesProps = {
  labels: string[];
  rows: BusinessOrderRow[];
  focusId: string | null;
};

type TipPoint = {
  id: string;
  name: string;
  value: number;
  color: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  focusId,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number; color?: string; name?: string }>;
  label?: string;
  focusId: string | null;
}) {
  if (!active || !payload?.length) return null;
  const points: TipPoint[] = payload
    .filter((item) => item.dataKey != null && item.dataKey !== 'label')
    .map((item) => ({
      id: String(item.dataKey),
      name: item.name || 'Negocio',
      value: Number(item.value ?? 0),
      color: item.color || '#334155',
    }));
  const focused = focusId ? points.filter((point) => point.id === focusId) : [];
  const shown = focused.length
    ? focused
    : points
        .filter((point) => point.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
  const zeros = points.filter((point) => point.value === 0).length;

  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      {shown.length === 0 ? <span>0 pedidos</span> : null}
      {shown.map((point) => (
        <span key={point.id} className={styles.tipRow}>
          <i style={{ background: point.color }} aria-hidden />
          {point.name}: {point.value}
        </span>
      ))}
      {!focusId && zeros > 0 ? (
        <span>
          {zeros} {zeros === 1 ? 'negocio' : 'negocios'} en cero
        </span>
      ) : null}
    </div>
  );
}

export function StatsBusinessLines({ labels, rows, focusId }: StatsBusinessLinesProps) {
  if (rows.length === 0 || labels.length === 0) {
    return <p className={styles.empty}>Ningún negocio con este filtro.</p>;
  }

  const data = businessLinePoints(labels, rows);
  const peak = rows.reduce((max, row) => Math.max(max, ...row.counts), 0);
  const ordered = [
    ...rows.filter((row) => row.orderCount === 0 && row.id !== focusId),
    ...rows.filter((row) => row.orderCount > 0 && row.id !== focusId),
    ...rows.filter((row) => row.id === focusId),
  ];

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(1, peak)]}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<ChartTooltip focusId={focusId} />} />
          {ordered.map((row) => {
            const focused = focusId === row.id;
            const dimmed = focusId != null && !focused;
            const stroke = row.orderCount === 0 && !focused ? ZERO_STROKE : row.color;
            return (
              <Line
                key={row.id}
                type="monotone"
                dataKey={row.id}
                name={row.name}
                stroke={stroke}
                strokeWidth={focused ? 2.75 : 1.75}
                strokeOpacity={dimmed ? 0.15 : 1}
                dot={false}
                activeDot={dimmed ? false : { r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
