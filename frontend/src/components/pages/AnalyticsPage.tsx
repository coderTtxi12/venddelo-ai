'use client';

import { useMemo, useState } from 'react';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DiscountOutlinedIcon from '@mui/icons-material/DiscountOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import InteractiveDonutChart from '@/components/analytics/InteractiveDonutChart';
import InteractiveProductBarChart from '@/components/analytics/InteractiveProductBarChart';
import InteractiveSalesChart from '@/components/analytics/InteractiveSalesChart';
import { useRestaurantAnalytics } from '@/hooks/useRestaurantAnalytics';
import { formatMoney } from '@/lib/currency';
import type { AnalyticsGranularity } from '@/lib/api/analytics';
import styles from './AnalyticsPage.module.css';

const CHART_COLORS = ['#4f46e5', '#3b82f6', '#f59e0b', '#10b981', '#ef4444'];

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Entrega',
  takeout: 'Para llevar',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

const PROMO_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  scheduled: 'Programada',
  expired: 'Expirada',
  outside_schedule: 'Fuera de horario',
  inactive: 'Inactiva',
};

function formatCents(cents: number) {
  return formatMoney(cents / 100);
}

function formatPctChange(pct: number | null | undefined) {
  if (pct == null) return { text: '—', up: true };
  const up = pct >= 0;
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct}%`, up };
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `•••${digits.slice(-4)}`;
}

export default function AnalyticsPage() {
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('monthly');
  const { data, loading, error, reload } = useRestaurantAnalytics(granularity);

  const salesChartData = useMemo(
    () =>
      (data?.sales_series ?? []).map((point) => ({
        label: point.label,
        revenueCents: point.revenue_cents,
        orderCount: point.order_count,
      })),
    [data?.sales_series],
  );

  const orderTypeSegments = useMemo(
    () =>
      (data?.order_types ?? []).map((item, index) => ({
        key: item.order_type,
        label: ORDER_TYPE_LABELS[item.order_type] ?? item.order_type,
        value: item.count,
        detail: formatCents(item.revenue_cents),
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [data?.order_types],
  );

  const paymentSegments = useMemo(
    () =>
      (data?.payment_methods ?? []).map((item, index) => ({
        key: item.payment_method,
        label: PAYMENT_LABELS[item.payment_method] ?? item.payment_method,
        value: item.count,
        detail: formatCents(item.revenue_cents),
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [data?.payment_methods],
  );

  const topProductChartData = useMemo(
    () =>
      (data?.top_products ?? []).map((product) => ({
        name: product.product_name,
        quantity: product.quantity,
        revenueCents: product.revenue_cents,
      })),
    [data?.top_products],
  );

  const summary = data?.summary;
  const customerStats = data?.customer_stats;
  const periodLabel = data?.period.label ?? 'Periodo actual';

  const revenueChange = formatPctChange(summary?.revenue_change_pct);
  const ordersChange = formatPctChange(summary?.order_count_change_pct);
  const avgChange = formatPctChange(summary?.avg_order_change_pct);

  const statsRow1 = summary
    ? [
        {
          label: 'Ventas Totales',
          value: formatCents(summary.total_revenue_cents),
          change: revenueChange.text,
          up: revenueChange.up,
        },
        {
          label: 'Órdenes Entregadas',
          value: summary.order_count.toLocaleString('es-MX'),
          change: ordersChange.text,
          up: ordersChange.up,
        },
        {
          label: 'Ticket Promedio',
          value: formatCents(summary.avg_order_cents),
          change: avgChange.text,
          up: avgChange.up,
        },
      ]
    : [];

  const statsRow2 = summary
    ? [
        {
          label: 'Clientes Recurrentes',
          value: `${customerStats?.repeat_customer_pct ?? 0}%`,
          meta: `${customerStats?.repeat_customers ?? 0} de ${customerStats?.unique_customers ?? 0} clientes`,
        },
        {
          label: 'Tasa de Cancelación',
          value: `${summary.cancellation_rate_pct}%`,
          meta: `${summary.cancelled_count} canceladas`,
        },
        {
          label: 'Descuentos Aplicados',
          value: formatCents(summary.total_discount_cents),
          meta: 'En órdenes entregadas',
        },
      ]
    : [];

  return (
    <div className={styles.analytics}>
      <div className={styles.mainCol}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Analíticas</h1>
            <p className={styles.subtitle}>
              Métricas reales de ventas y clientes de tu restaurante.
              {data?.period.label ? ` ${data.period.label}.` : ''}
            </p>
          </div>
          <button type="button" className={styles.refreshButton} onClick={() => void reload()}>
            Actualizar
          </button>
        </div>

        {loading && <div className={styles.stateBox}>Cargando analíticas…</div>}
        {!loading && error && (
          <div className={`${styles.stateBox} ${styles.stateError}`}>
            {error}
            <button type="button" className={styles.retryButton} onClick={() => void reload()}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className={styles.statsGrid}>
              {statsRow1.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statMeta}>
                    <span className={stat.up ? styles.up : styles.down}>{stat.change}</span>
                    {' '}vs periodo anterior
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.statsGrid}>
              {statsRow2.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statMeta}>{stat.meta}</span>
                </div>
              ))}
            </div>

            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <h2 className={styles.chartTitle}>Ventas por periodo</h2>
                <div className={styles.chartTabs} role="tablist" aria-label="Granularidad">
                  {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`${styles.chartTab} ${
                        granularity === mode ? styles.chartTabActive : ''
                      }`}
                      type="button"
                      role="tab"
                      aria-selected={granularity === mode}
                      onClick={() => setGranularity(mode)}
                    >
                      {mode === 'daily' ? 'Diario' : mode === 'weekly' ? 'Semanal' : 'Mensual'}
                    </button>
                  ))}
                </div>
              </div>
              <InteractiveSalesChart data={salesChartData} formatRevenue={formatCents} />
            </div>

            <div className={styles.splitCharts}>
              <div className={styles.chartSection}>
                <h2 className={styles.chartTitle}>Tipo de orden</h2>
                <InteractiveDonutChart
                  segments={orderTypeSegments}
                  centerLabel="Órdenes"
                  centerValue={String(summary?.order_count ?? 0)}
                />
              </div>
              <div className={styles.chartSection}>
                <h2 className={styles.chartTitle}>Método de pago</h2>
                <InteractiveDonutChart
                  segments={paymentSegments}
                  centerLabel="Órdenes"
                  centerValue={String(summary?.order_count ?? 0)}
                />
              </div>
            </div>

            {data.top_products.length > 0 && (
              <div className={styles.chartSection}>
                <h2 className={styles.chartTitle}>Top productos</h2>
                <InteractiveProductBarChart
                  data={topProductChartData}
                  formatRevenue={formatCents}
                />
              </div>
            )}
          </>
        )}
      </div>

      {!loading && !error && data && (
        <div className={styles.sideCol}>
          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>Resumen de Clientes</h3>
            <div className={styles.insightsList}>
              <div className={styles.insightRow}>
                <span className={styles.insightIcon}>
                  <PersonAddOutlinedIcon fontSize="small" />
                </span>
                <div className={styles.insightText}>
                  <span className={styles.insightLabel}>Nuevos Clientes</span>
                  <span className={styles.insightSub}>{periodLabel}</span>
                </div>
                <span className={styles.insightValue}>{customerStats?.new_customers ?? 0}</span>
              </div>
              <div className={styles.insightRow}>
                <span className={styles.insightIcon}>
                  <WorkspacePremiumOutlinedIcon fontSize="small" />
                </span>
                <div className={styles.insightText}>
                  <span className={styles.insightLabel}>Clientes Recurrentes</span>
                  <span className={styles.insightSub}>2+ órdenes en el periodo</span>
                </div>
                <span className={styles.insightValue}>{customerStats?.repeat_customers ?? 0}</span>
              </div>
              <div className={styles.insightRow}>
                <span className={styles.insightIcon}>
                  <GroupOutlinedIcon fontSize="small" />
                </span>
                <div className={styles.insightText}>
                  <span className={styles.insightLabel}>Clientes Únicos</span>
                  <span className={styles.insightSub}>Por teléfono</span>
                </div>
                <span className={styles.insightValue}>{customerStats?.unique_customers ?? 0}</span>
              </div>
            </div>
          </div>

          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>Top Clientes</h3>
            {data.top_customers.length === 0 ? (
              <p className={styles.emptySide}>Aún no hay clientes con órdenes entregadas.</p>
            ) : (
              <div className={styles.topList}>
                {data.top_customers.map((customer) => (
                  <div key={customer.customer_phone} className={styles.topRow}>
                    <div className={styles.topAvatar} aria-hidden="true">
                      {customer.customer_name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className={styles.topInfo}>
                      <span className={styles.topName}>{customer.customer_name}</span>
                      <span className={styles.topOrders}>
                        {customer.order_count} órdenes · {maskPhone(customer.customer_phone)}
                      </span>
                    </div>
                    <span className={styles.topTotal}>
                      {formatCents(customer.total_spent_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sideCard}>
            <div className={styles.retentionHeader}>
              <span>
                <PendingActionsOutlinedIcon fontSize="small" /> Órdenes en curso
              </span>
              <span className={styles.retentionValue}>{summary?.pending_orders ?? 0}</span>
            </div>
            <span className={styles.retentionSub}>Pendientes, confirmadas o en preparación</span>
          </div>

          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>Promociones</h3>
            {data.promotion_usage.length === 0 ? (
              <p className={styles.emptySide}>No hay promociones activas ni uso registrado.</p>
            ) : (
              <div className={styles.promoList}>
                {data.promotion_usage.map((promo) => (
                  <div key={promo.promotion_id ?? promo.promotion_name} className={styles.promoRow}>
                    <div className={styles.promoInfo}>
                      <span className={styles.promoName}>{promo.promotion_name}</span>
                      <span className={styles.promoDetail}>
                        {promo.usage_count} usos · {formatCents(promo.discount_cents)} descontados
                      </span>
                    </div>
                    <span className={styles.promoBadge}>
                      {PROMO_STATUS_LABELS[promo.effective_status ?? ''] ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sideCard}>
            <div className={styles.retentionHeader}>
              <span>
                <LocalShippingOutlinedIcon fontSize="small" /> Entrega vs para llevar
              </span>
            </div>
            <span className={styles.retentionSub}>
              {orderTypeSegments.map((s) => `${s.label}: ${s.value}`).join(' · ') || 'Sin órdenes'}
            </span>
          </div>

          <div className={styles.sideCard}>
            <div className={styles.retentionHeader}>
              <span>
                <DiscountOutlinedIcon fontSize="small" /> Descuentos del periodo
              </span>
              <span className={styles.retentionValue}>
                {formatCents(summary?.total_discount_cents ?? 0)}
              </span>
            </div>
            <span className={styles.retentionSub}>Total descontado en órdenes entregadas</span>
          </div>
        </div>
      )}
    </div>
  );
}
