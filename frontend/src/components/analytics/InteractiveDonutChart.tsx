'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './InteractiveDonutChart.module.css';

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  detail?: string;
  color: string;
};

type InteractiveDonutChartProps = {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
};

type DonutTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DonutSegment }>;
};

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const segment = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{segment.label}</strong>
      <span>{segment.value} órdenes</span>
      {segment.detail && <span>{segment.detail}</span>}
    </div>
  );
}

export default function InteractiveDonutChart({
  segments,
  centerLabel,
  centerValue,
}: InteractiveDonutChartProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className={styles.empty}>Sin datos en este periodo.</p>;
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
          <span className={styles.centerValue}>{centerValue}</span>
          <span className={styles.centerLabel}>{centerLabel}</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: segment.color }} />
            <span className={styles.legendText}>
              <span className={styles.legendLabel}>{segment.label}</span>
              {segment.detail && <span className={styles.legendDetail}>{segment.detail}</span>}
            </span>
            <span className={styles.legendValue}>{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
