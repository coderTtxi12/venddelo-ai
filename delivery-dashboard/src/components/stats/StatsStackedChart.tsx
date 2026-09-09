'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './StatsTrendChart.module.css';

export type StatsStackedPoint = {
  label: string;
  delivered: number;
  cancelled: number;
};

type StatsStackedChartProps = {
  data: StatsStackedPoint[];
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
  const delivered = payload.find((item) => item.dataKey === 'delivered')?.value ?? 0;
  const cancelled = payload.find((item) => item.dataKey === 'cancelled')?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>Entregados: {delivered}</span>
      <span>Cancelados: {cancelled}</span>
    </div>
  );
}

export function StatsStackedChart({ data }: StatsStackedChartProps) {
  const hasValues = data.some((point) => point.delivered > 0 || point.cancelled > 0);
  if (!hasValues) {
    return <p className={styles.empty}>No hay pedidos cerrados en este periodo.</p>;
  }

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            formatter={(value) => (value === 'delivered' ? 'Entregados' : 'Cancelados')}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="delivered" name="delivered" stackId="closed" fill="#2563eb" maxBarSize={22} radius={[0, 0, 0, 0]} />
          <Bar dataKey="cancelled" name="cancelled" stackId="closed" fill="#d97706" maxBarSize={22} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
