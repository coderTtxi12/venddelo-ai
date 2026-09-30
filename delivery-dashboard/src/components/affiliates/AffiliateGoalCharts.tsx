'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AFFILIATE_GOAL,
  affiliateChartRows,
  type AffiliateChartRow,
  type AffiliateGoalSnapshot,
  type AffiliateWeek,
} from '@/lib/affiliates/affiliateGoal';
import styles from './AffiliateGoalCharts.module.css';

const ACTIVE = '#2563eb';
const HOLD = '#d97706';
const STOCK = '#0f172a';
const GOAL = '#15803d';

const TREND_HEIGHT = 280;
const WEEK_HEIGHT = 240;

type AffiliateGoalChartsProps = {
  snapshot: AffiliateGoalSnapshot;
};

function stockDomain(rows: AffiliateChartRow[]): [number, number] {
  const peak = Math.max(
    AFFILIATE_GOAL,
    ...rows.map((row) => Math.max(row.cumulative ?? 0, row.forecast ?? 0)),
  );
  return [0, Math.ceil((peak * 1.08) / 10) * 10];
}

function flowDomain(weeks: AffiliateWeek[]): [number, number] {
  const peak = Math.max(1, ...weeks.map((week) => week.joinedActive + week.joinedHold));
  return [0, Math.ceil(peak + 0.5)];
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string; value?: number | null }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const cumulative = payload.find((item) => item.dataKey === 'cumulative')?.value;
  const forecast = payload.find((item) => item.dataKey === 'forecast')?.value;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      {cumulative != null ? <span>Sin hold: {cumulative}</span> : null}
      {forecast != null && forecast !== cumulative ? <span>Proyección: {forecast}</span> : null}
    </div>
  );
}

function WeekTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const joinedActive = payload.find((item) => item.dataKey === 'joinedActive')?.value ?? 0;
  const joinedHold = payload.find((item) => item.dataKey === 'joinedHold')?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <strong>{label}</strong>
      <span>Siguen activos: {joinedActive}</span>
      <span>Pasaron a hold: {joinedHold}</span>
    </div>
  );
}

export function AffiliateGoalCharts({ snapshot }: AffiliateGoalChartsProps) {
  const trend = affiliateChartRows(snapshot);
  const showForecast = snapshot.forecast.length > 0;
  const weekTicks = snapshot.weeks.length > 6 ? 'preserveStartEnd' : 0;

  return (
    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="affiliate-trend-title">
        <div className={styles.cardHead}>
          <h2 id="affiliate-trend-title">Hacia los 100</h2>
          <p>La línea es el acumulado sin hold. La punteada sigue las altas de septiembre que siguen activas.</p>
        </div>
        <ul className={styles.legend}>
          <li>
            <span className={styles.line} />
            Sin hold
          </li>
          {showForecast ? (
            <li>
              <span className={`${styles.line} ${styles.dashed}`} />
              Proyección
            </li>
          ) : null}
          <li>
            <span className={styles.goal} />
            Meta 100
          </li>
        </ul>
        <div
          className={styles.chart}
          style={{ height: TREND_HEIGHT }}
          role="img"
          aria-label="Gráfica del acumulado de restaurantes sin hold y su proyección"
        >
          <ResponsiveContainer width="100%" height={TREND_HEIGHT}>
            <ComposedChart data={trend} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={stockDomain(trend)}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<TrendTooltip />} />
              <ReferenceLine y={AFFILIATE_GOAL} stroke={GOAL} strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Sin hold"
                stroke={STOCK}
                strokeWidth={2.5}
                dot={{ r: 3, fill: STOCK, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {showForecast ? (
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Proyección"
                  stroke={ACTIVE}
                  strokeWidth={2.5}
                  strokeDasharray="6 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="affiliate-weeks-title">
        <div className={styles.cardHead}>
          <h2 id="affiliate-weeks-title">Altas y bajas por semana</h2>
          <p>
            Cada barra es una semana desde el 1 de septiembre. El ámbar son los que de esa semana ya
            están en hold.
          </p>
        </div>
        <ul className={styles.legend}>
          <li>
            <span className={styles.bar} />
            Siguen activos
          </li>
          <li>
            <span className={`${styles.bar} ${styles.hold}`} />
            En hold
          </li>
        </ul>
        <div
          className={styles.chart}
          style={{ height: WEEK_HEIGHT }}
          role="img"
          aria-label="Gráfica semanal de altas que siguen activas y altas que pasaron a hold"
        >
          <ResponsiveContainer width="100%" height={WEEK_HEIGHT}>
            <ComposedChart data={snapshot.weeks} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                interval={weekTicks}
                minTickGap={8}
              />
              <YAxis
                domain={flowDomain(snapshot.weeks)}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<WeekTooltip />} />
              <Bar
                dataKey="joinedActive"
                name="Siguen activos"
                stackId="week"
                fill={ACTIVE}
                maxBarSize={56}
                isAnimationActive={false}
              />
              <Bar
                dataKey="joinedHold"
                name="En hold"
                stackId="week"
                fill={HOLD}
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
