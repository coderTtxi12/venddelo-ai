'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './StatsRankChart.module.css';

export type StatsRankPoint = {
  key: string;
  label: string;
  value: number;
  detail?: string;
};

type StatsRankChartProps = {
  data: StatsRankPoint[];
  formatValue: (value: number) => string;
};

function BarTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: StatsRankPoint }>;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{point.label}</strong>
      <span>{formatValue(point.value)} entregas</span>
      {point.detail ? <span>{point.detail}</span> : null}
    </div>
  );
}

const BAR_COLOR = '#2563eb';

export function StatsRankChart({ data, formatValue }: StatsRankChartProps) {
  if (data.length === 0) {
    return <p className={styles.empty}>No hay pedidos entregados en este periodo.</p>;
  }

  const chartHeight = Math.max(160, data.length * 52);

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<BarTooltip formatValue={formatValue} />}
            cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22} fill={BAR_COLOR}>
            {data.map((point) => (
              <Cell key={point.key} fill={BAR_COLOR} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(label) => formatValue(Number(label) || 0)}
              className={styles.barLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
