'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './InteractiveProductBarChart.module.css';

export type ProductBarPoint = {
  name: string;
  quantity: number;
  revenueCents: number;
};

type InteractiveProductBarChartProps = {
  data: ProductBarPoint[];
  formatRevenue: (cents: number) => string;
};

type ProductTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ProductBarPoint }>;
  formatRevenue: (cents: number) => string;
};

function ProductTooltip({ active, payload, formatRevenue }: ProductTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const product = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{product.name}</strong>
      <span>{product.quantity} unidades</span>
      <span>{formatRevenue(product.revenueCents)}</span>
    </div>
  );
}

export default function InteractiveProductBarChart({
  data,
  formatRevenue,
}: InteractiveProductBarChartProps) {
  if (data.length === 0) return null;

  const chartHeight = Math.max(180, data.length * 42);

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11, fill: '#334155' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<ProductTooltip formatRevenue={formatRevenue} />}
            cursor={{ fill: 'rgba(79, 70, 229, 0.06)' }}
          />
          <Bar
            dataKey="quantity"
            fill="#4f46e5"
            radius={[0, 6, 6, 0]}
            maxBarSize={18}
            activeBar={{ fill: '#4338ca' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
