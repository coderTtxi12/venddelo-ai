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
import styles from './InteractiveHorizontalBarChart.module.css';

export type HorizontalBarPoint = {
  key: string;
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

type InteractiveHorizontalBarChartProps = {
  data: HorizontalBarPoint[];
  formatValue: (value: number) => string;
  valueSuffix?: string;
  emptyMessage?: string;
};

type BarTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: HorizontalBarPoint & { value: number } }>;
  formatValue: (value: number) => string;
  valueSuffix?: string;
};

function BarTooltip({ active, payload, formatValue, valueSuffix }: BarTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{point.label}</strong>
      <span>
        {formatValue(point.value)}
        {valueSuffix ? ` ${valueSuffix}` : ''}
      </span>
      {point.detail && <span>{point.detail}</span>}
    </div>
  );
}

const DEFAULT_COLORS = ['#4f46e5', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export default function InteractiveHorizontalBarChart({
  data,
  formatValue,
  valueSuffix,
  emptyMessage = 'Sin datos en este periodo.',
}: InteractiveHorizontalBarChartProps) {
  if (data.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  const chartData = data.map((point, index) => ({
    ...point,
    color: point.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  const chartHeight = Math.max(160, chartData.length * 52);

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<BarTooltip formatValue={formatValue} valueSuffix={valueSuffix} />}
            cursor={{ fill: 'rgba(79, 70, 229, 0.06)' }}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={22}>
            {chartData.map((point) => (
              <Cell key={point.key} fill={point.color} />
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
