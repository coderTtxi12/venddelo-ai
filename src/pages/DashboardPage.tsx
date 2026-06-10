import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardPage.module.css';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import QuickActionCard from '../components/ui/QuickActionCard';
import quickActionCardStyles from '../components/ui/QuickActionCard.module.css';

type DashboardQuickAction = {
  title: string;
  desc: string;
  /** Ruta interna al hacer clic */
  to?: string;
};

const quickActions: DashboardQuickAction[] = [
  {
    title: 'Productos',
    desc: 'Administra tus productos, categorías y promociones',
    to: '/products',
  },
];

const statsRow1 = [
  { label: 'Ventas Totales', value: '$54,890', change: '+12.5%', period: 'Este mes', up: true },
  { label: 'Órdenes', value: '1,429', change: '+8.2%', period: 'Este mes', up: true },
  { label: 'Valor Promedio de Orden', value: '$38.42', change: '+3.1%', period: 'Este mes', up: true },
];

const statsRow2 = [
  { label: 'Clientes Recurrentes', value: '68%', change: '+2.4%', period: 'Este mes', up: true },
  { label: 'Abandono de Carrito', value: '23.8%', change: '-1.8%', period: 'Este mes', up: false },
  { label: 'Vistas de Productos', value: '45,210', change: '+15.3%', period: 'Este mes', up: true },
];

const dailyData = [
  { label: 'Lun', value: 3200 },
  { label: 'Mar', value: 2800 },
  { label: 'Mié', value: 3500 },
  { label: 'Jue', value: 4200 },
  { label: 'Vie', value: 6100 },
  { label: 'Sáb', value: 5400 },
  { label: 'Dom', value: 3000 },
];

const weeklyData = [
  { label: 'Semana 1', value: 12500 },
  { label: 'Semana 2', value: 15200 },
  { label: 'Semana 3', value: 17100 },
  { label: 'Semana 4', value: 18900 },
];

const monthlyData = [
  { label: 'Ene', value: 3200 },
  { label: 'Feb', value: 4100 },
  { label: 'Mar', value: 3800 },
  { label: 'Abr', value: 5500 },
  { label: 'May', value: 7200 },
  { label: 'Jun', value: 6100 },
  { label: 'Jul', value: 4900 },
  { label: 'Ago', value: 8500 },
  { label: 'Sep', value: 7800 },
  { label: 'Oct', value: 6300 },
  { label: 'Nov', value: 9200 },
  { label: 'Dic', value: 8000 },
];

const customerInsights = [
  { icon: <PersonAddOutlinedIcon fontSize="small" />, label: 'Nuevos Clientes', sub: 'Esta semana', value: 15 },
  { icon: <WorkspacePremiumOutlinedIcon fontSize="small" />, label: 'Clientes VIP', sub: 'Activos', value: 12 },
  { icon: <GroupOutlinedIcon fontSize="small" />, label: 'Total Clientes', sub: 'Histórico', value: '2,847' },
];

const topCustomers = [
  { name: 'Alice Johnson', orders: 23, total: '$2,340' },
  { name: 'Robert Smith', orders: 18, total: '$1,980' },
  { name: 'María García', orders: 15, total: '$1,850' },
];

const promotions = [
  { name: 'Venta de Temporada', type: 'Código de Descuento', detail: '234 usados', status: 'Activo' },
  { name: 'Bienvenida Nuevo Cliente', type: 'Campaña de Email', detail: '85% tasa apertura', status: 'Activo' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const chartDataset = useMemo(() => {
    switch (mode) {
      case 'daily':
        return dailyData;
      case 'weekly':
        return weeklyData;
      case 'monthly':
      default:
        return monthlyData;
    }
  }, [mode]);

  const maxChartValue = useMemo(
    () => Math.max(...chartDataset.map((d) => d.value)),
    [chartDataset],
  );

  return (
    <div className={styles.dashboard}>
      <div className={styles.mainCol}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>
              ¡Bienvenido! Aquí tienes lo que pasa hoy en tu startup.
            </p>
          </div>
        </div>

        <div className={quickActionCardStyles.cardsRow}>
          {quickActions.map((a) => (
            <QuickActionCard
              key={a.title}
              title={a.title}
              description={a.desc}
              onClick={() => {
                if (a.to) navigate(a.to);
              }}
            />
          ))}
        </div>

        <div className={styles.statsGrid}>
          {statsRow1.map((s) => (
            <div key={s.label} className={styles.statCard}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statMeta}>
                <span className={s.up ? styles.up : styles.down}>{s.change}</span>
                {' '}{s.period}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.statsGrid}>
          {statsRow2.map((s) => (
            <div key={s.label} className={styles.statCard}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statMeta}>
                <span className={s.up ? styles.up : styles.down}>{s.change}</span>
                {' '}{s.period}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.chartSection}>
          <div className={styles.chartHeader}>
            <h2 className={styles.chartTitle}>Analíticas de Ventas</h2>
            <div className={styles.chartTabs}>
              <button
                className={`${styles.chartTab} ${
                  mode === 'daily' ? styles.chartTabActive : ''
                }`}
                type="button"
                onClick={() => setMode('daily')}
              >
                Diario
              </button>
              <button
                className={`${styles.chartTab} ${
                  mode === 'weekly' ? styles.chartTabActive : ''
                }`}
                type="button"
                onClick={() => setMode('weekly')}
              >
                Semanal
              </button>
              <button
                className={`${styles.chartTab} ${
                  mode === 'monthly' ? styles.chartTabActive : ''
                }`}
                type="button"
                onClick={() => setMode('monthly')}
              >
                Mensual
              </button>
            </div>
          </div>
          <div className={styles.chart}>
            <div className={styles.chartYAxis}>
              {[10000, 7500, 5000, 2500, 0].map((v) => (
                <span key={v}>{v.toLocaleString()}</span>
              ))}
            </div>
            <div className={styles.chartBars}>
              {chartDataset.map((d) => (
                <div key={d.label} className={styles.chartBarGroup}>
                  <div className={styles.chartBarTrack}>
                    <div
                      className={styles.chartBar}
                      style={{ height: `${(d.value / maxChartValue) * 100}%` }}
                    />
                  </div>
                  <span className={styles.chartLabel}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.sideCol}>
        <div className={styles.sideCard}>
          <h3 className={styles.sideTitle}>Resumen de Usuarios</h3>
          <div className={styles.insightsList}>
            {customerInsights.map((c) => (
              <div key={c.label} className={styles.insightRow}>
                <span className={styles.insightIcon}>{c.icon}</span>
                <div className={styles.insightText}>
                  <span className={styles.insightLabel}>{c.label}</span>
                  <span className={styles.insightSub}>{c.sub}</span>
                </div>
                <span className={styles.insightValue}>{c.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sideCard}>
          <h3 className={styles.sideTitle}>Top Clientes</h3>
          <div className={styles.topList}>
            {topCustomers.map((c) => (
              <div key={c.name} className={styles.topRow}>
                <div className={styles.topAvatar}>{c.name[0]}</div>
                <div className={styles.topInfo}>
                  <span className={styles.topName}>{c.name}</span>
                  <span className={styles.topOrders}>{c.orders} órdenes</span>
                </div>
                <span className={styles.topTotal}>{c.total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sideCard}>
          <div className={styles.retentionHeader}>
            <span>Retención de Clientes</span>
            <span className={styles.retentionValue}>60%</span>
          </div>
          <span className={styles.retentionSub}>+2.4% vs. mes pasado</span>
        </div>

        <div className={styles.sideCard}>
          <h3 className={styles.sideTitle}>Promociones Activas</h3>
          <div className={styles.promoList}>
            {promotions.map((p) => (
              <div key={p.name} className={styles.promoRow}>
                <div className={styles.promoInfo}>
                  <span className={styles.promoName}>{p.name}</span>
                  <span className={styles.promoDetail}>
                    {p.type} · {p.detail}
                  </span>
                </div>
                <span className={styles.promoBadge}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
