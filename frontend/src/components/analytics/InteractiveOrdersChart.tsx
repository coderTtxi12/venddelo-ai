'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './InteractiveOrdersChart.module.css';

export type OrdersChartPoint = {
  label: string;
  orderCount: number;
};

type InteractiveOrdersChartProps = {
  data: OrdersChartPoint[];
};

type OrdersTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { orders: number } }>;
  label?: string | number;
};

function OrdersTooltip({ active, payload, label }: OrdersTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const orders = payload[0].payload.orders;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>
        {orders} {orders === 1 ? 'orden' : 'órdenes'}
      </span>
    </div>
  );
}

export default function InteractiveOrdersChart({ data }: InteractiveOrdersChartProps) {
  if (data.length === 0) {
    return <p className={styles.empty}>Sin órdenes en este periodo.</p>;
  }

  const chartData = data.map((point) => ({
    label: point.label,
    orders: point.orderCount,
  }));

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<OrdersTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
          <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48}>
            <LabelList
              dataKey="orders"
              position="top"
              className={styles.barLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
