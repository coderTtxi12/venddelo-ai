import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import TrendingDownOutlinedIcon from '@mui/icons-material/TrendingDownOutlined';
import styles from './AnalyticsOwnerInsights.module.css';

type AnalyticsOwnerInsightsProps = {
  periodLabel: string;
  totalRevenue: string;
  orderCount: number;
  avgTicket: string;
  revenueChange: string;
  revenueUp: boolean;
};

export default function AnalyticsOwnerInsights({
  periodLabel,
  totalRevenue,
  orderCount,
  avgTicket,
  revenueChange,
  revenueUp,
}: AnalyticsOwnerInsightsProps) {
  return (
    <section className={styles.banner} aria-label="Resumen del periodo">
      <div className={styles.copy}>
        <p className={styles.kicker}>Resumen fácil · {periodLabel}</p>
        <p className={styles.headline}>
          Vendiste <strong>{totalRevenue}</strong> con{' '}
          <strong>{orderCount.toLocaleString('es-MX')}</strong>{' '}
          {orderCount === 1 ? 'orden entregada' : 'órdenes entregadas'}.
        </p>
        <p className={styles.subline}>
          Cada cliente gastó en promedio <strong>{avgTicket}</strong> por orden.
        </p>
      </div>
      <div className={styles.changeBadge} data-up={revenueUp}>
        {revenueUp ? (
          <TrendingUpOutlinedIcon fontSize="small" aria-hidden="true" />
        ) : (
          <TrendingDownOutlinedIcon fontSize="small" aria-hidden="true" />
        )}
        <div>
          <span className={styles.changeValue}>{revenueChange}</span>
          <span className={styles.changeLabel}>vs periodo anterior</span>
        </div>
      </div>
    </section>
  );
}
