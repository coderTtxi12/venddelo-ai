'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './StatsSourceDonut.module.css';

export type StatsDonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type StatsSourceDonutProps = {
  segments: StatsDonutSegment[];
};

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: StatsDonutSegment }>;
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const segment = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{segment.label}</strong>
      <span>{segment.value} pedidos</span>
    </div>
  );
}

export function StatsSourceDonut({ segments }: StatsSourceDonutProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return <p className={styles.empty}>No hay pedidos cerrados en este periodo.</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.chartShell}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {segments.map((segment) => (
                <Cell key={segment.key} fill={segment.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.centerOverlay} aria-hidden="true">
          <span className={styles.centerValue}>{total}</span>
          <span className={styles.centerLabel}>cerrados</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: segment.color }} />
            <span className={styles.legendText}>
              <span className={styles.legendLabel}>{segment.label}</span>
              <span className={styles.legendDetail}>
                {Math.round((segment.value / total) * 100)}%
              </span>
            </span>
            <span className={styles.legendValue}>{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
