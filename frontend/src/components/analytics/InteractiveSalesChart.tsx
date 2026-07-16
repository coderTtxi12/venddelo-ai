'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './InteractiveSalesChart.module.css';

export type SalesChartPoint = {
  label: string;
  revenueCents: number;
  orderCount: number;
};

type InteractiveSalesChartProps = {
  data: SalesChartPoint[];
  formatRevenue: (cents: number) => string;
};

type SalesTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { revenue: number; orders: number } }>;
  label?: string | number;
  formatRevenue: (cents: number) => string;
};

function SalesTooltip({ active, payload, label, formatRevenue }: SalesTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>{formatRevenue(point.revenue)}</span>
      <span>{point.orders} órdenes</span>
    </div>
  );
}

export default function InteractiveSalesChart({
  data,
  formatRevenue,
}: InteractiveSalesChartProps) {
  if (data.length === 0) {
    return <p className={styles.empty}>Sin ventas en este periodo.</p>;
  }

  const chartData = data.map((point) => ({
    label: point.label,
    revenue: point.revenueCents,
    orders: point.orderCount,
  }));

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatRevenue(value)}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            content={<SalesTooltip formatRevenue={formatRevenue} />}
            cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#4f46e5"
            strokeWidth={2}
            fill="url(#salesGradient)"
            activeDot={{ r: 5, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
