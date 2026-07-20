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
import styles from './InteractiveTicketChart.module.css';

export type TicketChartPoint = {
  label: string;
  avgOrderCents: number;
};

type InteractiveTicketChartProps = {
  data: TicketChartPoint[];
  formatRevenue: (cents: number) => string;
};

type TicketTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { ticket: number } }>;
  label?: string | number;
  formatRevenue: (cents: number) => string;
};

function TicketTooltip({ active, payload, label, formatRevenue }: TicketTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>Ticket: {formatRevenue(payload[0].payload.ticket)}</span>
    </div>
  );
}

export default function InteractiveTicketChart({
  data,
  formatRevenue,
}: InteractiveTicketChartProps) {
  const chartData = data.filter((point) => point.avgOrderCents > 0);

  if (chartData.length === 0) {
    return <p className={styles.empty}>Sin ticket promedio en este periodo.</p>;
  }

  const mapped = chartData.map((point) => ({
    label: point.label,
    ticket: point.avgOrderCents,
  }));

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={mapped} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#64748b' }}
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
          <Tooltip content={<TicketTooltip formatRevenue={formatRevenue} />} />
          <Line
            type="monotone"
            dataKey="ticket"
            stroke="#f59e0b"
            strokeWidth={3}
            dot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
