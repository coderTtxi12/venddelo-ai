'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DiscountOutlinedIcon from '@mui/icons-material/DiscountOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import AnalyticsChartCard from '@/components/analytics/AnalyticsChartCard';
import AnalyticsOwnerInsights from '@/components/analytics/AnalyticsOwnerInsights';
import AnalyticsPeriodControl from '@/components/analytics/AnalyticsPeriodControl';
import InteractiveDonutChart from '@/components/analytics/InteractiveDonutChart';
import InteractiveHorizontalBarChart from '@/components/analytics/InteractiveHorizontalBarChart';
import InteractiveOrdersChart from '@/components/analytics/InteractiveOrdersChart';
import InteractiveProductBarChart from '@/components/analytics/InteractiveProductBarChart';
import InteractiveSalesChart from '@/components/analytics/InteractiveSalesChart';
import InteractiveTicketChart from '@/components/analytics/InteractiveTicketChart';
import { useRestaurantAnalytics } from '@/hooks/useRestaurantAnalytics';
import {
  buildAnalyticsPeriodSearchParams,
  parseAnalyticsPeriodSearchParams,
  toAnalyticsPeriodQuery,
  type AnalyticsPeriodState,
} from '@/lib/analytics/period';
import { formatMoney } from '@/lib/currency';
import styles from './AnalyticsPage.module.css';

const CHART_COLORS = ['#4f46e5', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Entrega a domicilio',
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

function pctOf(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `•••${digits.slice(-4)}`;
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [periodState, setPeriodState] = useState<AnalyticsPeriodState>(() =>
    parseAnalyticsPeriodSearchParams(searchParams),
  );
  const periodQuery = useMemo(() => toAnalyticsPeriodQuery(periodState), [periodState]);
  const { data, loading, refreshing, error, reload } = useRestaurantAnalytics(periodQuery);
  const showInitialLoading = loading && !data;

  const handlePeriodChange = useCallback(
    (next: AnalyticsPeriodState) => {
      setPeriodState(next);
      const params = buildAnalyticsPeriodSearchParams(next);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const salesChartData = useMemo(
    () =>
      (data?.sales_series ?? []).map((point) => ({
        label: point.label,
        revenueCents: point.revenue_cents,
        orderCount: point.order_count,
      })),
    [data?.sales_series],
  );

  const ticketChartData = useMemo(
    () =>
      salesChartData.map((point) => ({
        label: point.label,
        avgOrderCents:
          point.orderCount > 0 ? Math.round(point.revenueCents / point.orderCount) : 0,
      })),
    [salesChartData],
  );

  const orderTypeSegments = useMemo(() => {
    const total = (data?.order_types ?? []).reduce((sum, item) => sum + item.count, 0);
    return (data?.order_types ?? []).map((item, index) => ({
      key: item.order_type,
      label: ORDER_TYPE_LABELS[item.order_type] ?? item.order_type,
      value: item.count,
      detail: `${formatCents(item.revenue_cents)} · ${pctOf(item.count, total)}`,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [data?.order_types]);

  const paymentSegments = useMemo(() => {
    const total = (data?.payment_methods ?? []).reduce((sum, item) => sum + item.count, 0);
    return (data?.payment_methods ?? []).map((item, index) => ({
      key: item.payment_method,
      label: PAYMENT_LABELS[item.payment_method] ?? item.payment_method,
      value: item.count,
      detail: `${formatCents(item.revenue_cents)} · ${pctOf(item.count, total)}`,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [data?.payment_methods]);

  const paymentRevenueBars = useMemo(() => {
    const total = (data?.payment_methods ?? []).reduce((sum, item) => sum + item.revenue_cents, 0);
    return [...(data?.payment_methods ?? [])]
      .sort((a, b) => b.revenue_cents - a.revenue_cents)
      .map((item, index) => ({
        key: item.payment_method,
        label: PAYMENT_LABELS[item.payment_method] ?? item.payment_method,
        value: item.revenue_cents,
        detail: `${item.count} órdenes · ${pctOf(item.revenue_cents, total)} del total`,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }, [data?.payment_methods]);

  const orderTypeRevenueBars = useMemo(() => {
    const total = (data?.order_types ?? []).reduce((sum, item) => sum + item.revenue_cents, 0);
    return [...(data?.order_types ?? [])]
      .sort((a, b) => b.revenue_cents - a.revenue_cents)
      .map((item, index) => ({
        key: item.order_type,
        label: ORDER_TYPE_LABELS[item.order_type] ?? item.order_type,
        value: item.revenue_cents,
        detail: `${item.count} órdenes · ${pctOf(item.revenue_cents, total)} del total`,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }, [data?.order_types]);

  const topProductChartData = useMemo(
    () =>
      (data?.top_products ?? []).map((product) => ({
        name: product.product_name,
        quantity: product.quantity,
        revenueCents: product.revenue_cents,
      })),
    [data?.top_products],
  );

  const topProductRevenueBars = useMemo(
    () =>
      [...(data?.top_products ?? [])]
        .sort((a, b) => b.revenue_cents - a.revenue_cents)
        .map((product, index) => ({
          key: product.product_id ?? product.product_name,
          label: product.product_name,
          value: product.revenue_cents,
          detail: `${product.quantity} unidades vendidas`,
          color: CHART_COLORS[index % CHART_COLORS.length],
        })),
    [data?.top_products],
  );

  const topCustomerBars = useMemo(
    () =>
      (data?.top_customers ?? []).map((customer, index) => ({
        key: customer.customer_phone,
        label: customer.customer_name,
        value: customer.total_spent_cents,
        detail: `${customer.order_count} órdenes · ${maskPhone(customer.customer_phone)}`,
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [data?.top_customers],
  );

  const promoUsageBars = useMemo(
    () =>
      [...(data?.promotion_usage ?? [])]
        .sort((a, b) => b.usage_count - a.usage_count)
        .map((promo, index) => ({
          key: promo.promotion_id ?? promo.promotion_name,
          label: promo.promotion_name,
          value: promo.usage_count,
          detail: `${formatCents(promo.discount_cents)} descontados · ${
            PROMO_STATUS_LABELS[promo.effective_status ?? ''] ?? '—'
          }`,
          color: CHART_COLORS[index % CHART_COLORS.length],
        })),
    [data?.promotion_usage],
  );

  const customerMixSegments = useMemo(() => {
    const unique = data?.customer_stats.unique_customers ?? 0;
    const repeat = data?.customer_stats.repeat_customers ?? 0;
    const singleOrder = Math.max(unique - repeat, 0);
    return [
      {
        key: 'repeat',
        label: 'Varias órdenes',
        value: repeat,
        detail: 'Clientes que pidieron 2+ veces',
        color: '#4f46e5',
      },
      {
        key: 'single',
        label: 'Una sola orden',
        value: singleOrder,
        detail: 'Clientes con una sola compra',
        color: '#3b82f6',
      },
    ].filter((segment) => segment.value > 0);
  }, [data?.customer_stats]);

  const summary = data?.summary;
  const customerStats = data?.customer_stats;
  const periodLabel = data?.period.label ?? 'Periodo actual';

  const revenueChange = formatPctChange(summary?.revenue_change_pct);
  const ordersChange = formatPctChange(summary?.order_count_change_pct);
  const avgChange = formatPctChange(summary?.avg_order_change_pct);

  const stats = summary
    ? [
        {
          label: 'Ventas totales',
          helper: 'Dinero de órdenes entregadas',
          value: formatCents(summary.total_revenue_cents),
          change: revenueChange.text,
          up: revenueChange.up,
        },
        {
          label: 'Órdenes entregadas',
          helper: 'Pedidos completados en cocina',
          value: summary.order_count.toLocaleString('es-MX'),
          change: ordersChange.text,
          up: ordersChange.up,
        },
        {
          label: 'Ticket promedio',
          helper: 'Cuánto gasta cada cliente por orden',
          value: formatCents(summary.avg_order_cents),
          change: avgChange.text,
          up: avgChange.up,
        },
        {
          label: 'Clientes únicos',
          helper: 'Personas distintas que pidieron',
          value: String(customerStats?.unique_customers ?? 0),
          meta: `${customerStats?.new_customers ?? 0} nuevos en el periodo`,
        },
        {
          label: 'Clientes recurrentes',
          helper: 'Pidieron 2 o más veces',
          value: `${customerStats?.repeat_customer_pct ?? 0}%`,
          meta: `${customerStats?.repeat_customers ?? 0} clientes fieles`,
        },
        {
          label: 'Cancelaciones',
          helper: 'Órdenes canceladas del total',
          value: `${summary.cancellation_rate_pct}%`,
          meta: `${summary.cancelled_count} canceladas`,
        },
        {
          label: 'Descuentos',
          helper: 'Total descontado en promociones',
          value: formatCents(summary.total_discount_cents),
          meta: 'En órdenes entregadas',
        },
        {
          label: 'Órdenes en curso',
          helper: 'Aún no terminadas',
          value: String(summary.pending_orders),
          meta: 'Pendientes o en preparación',
        },
      ]
    : [];

  const refreshingClass = refreshing ? styles.contentRefreshing : undefined;

  return (
    <div className={styles.analytics}>
      <header className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Analíticas de tu restaurante</h1>
          <p className={styles.subtitle}>
            Todo lo que necesitas saber de ventas, clientes y productos.
            {data?.period.label ? ` Periodo: ${data.period.label}.` : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          <AnalyticsPeriodControl
            value={periodState}
            refreshing={refreshing}
            onChange={handlePeriodChange}
          />
          <button
            type="button"
            className={styles.refreshButton}
            disabled={refreshing}
            onClick={() => void reload()}
          >
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      {showInitialLoading && <div className={styles.stateBox}>Cargando analíticas…</div>}
      {!showInitialLoading && error && !data && (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          {error}
          <button type="button" className={styles.retryButton} onClick={() => void reload()}>
            Reintentar
          </button>
        </div>
      )}

      {data && summary && (
        <>
          {error && (
            <div className={`${styles.stateBox} ${styles.stateError}`}>
              {error}
              <button type="button" className={styles.retryButton} onClick={() => void reload()}>
                Reintentar
              </button>
            </div>
          )}

          <div className={refreshingClass}>
            <AnalyticsOwnerInsights
              periodLabel={periodLabel}
              totalRevenue={formatCents(summary.total_revenue_cents)}
              orderCount={summary.order_count}
              avgTicket={formatCents(summary.avg_order_cents)}
              revenueChange={revenueChange.text}
              revenueUp={revenueChange.up}
            />
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Números clave</h2>
            <p className={styles.sectionIntro}>
              Lee estos totales primero. Cada tarjeta compara contra el periodo anterior cuando aplica.
            </p>
            <div className={`${styles.statsGrid} ${refreshingClass ?? ''}`}>
              {stats.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.statHelper}>{stat.helper}</span>
                  <span className={styles.statValue}>{stat.value}</span>
                  {'change' in stat && stat.change ? (
                    <span className={styles.statMeta}>
                      <span className={stat.up ? styles.up : styles.down}>{stat.change}</span> vs
                      periodo anterior
                    </span>
                  ) : (
                    <span className={styles.statMeta}>{stat.meta}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tendencias de ventas</h2>
            <p className={styles.sectionIntro}>
              Mira cómo suben o bajan tus ventas, órdenes y ticket promedio en el tiempo.
            </p>
            <div className={styles.chartGrid}>
              <AnalyticsChartCard
                fullWidth
                title="Ventas por periodo"
                subtitle="Cuánto dinero entró en cada día, semana o mes."
                help="La línea morada muestra tus ingresos totales."
              >
                <div className={refreshingClass}>
                  <InteractiveSalesChart data={salesChartData} formatRevenue={formatCents} />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Órdenes por periodo"
                subtitle="Cuántos pedidos entregaste en cada tramo."
              >
                <div className={refreshingClass}>
                  <InteractiveOrdersChart data={salesChartData} />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Ticket promedio"
                subtitle="Cuánto gastó en promedio cada cliente por orden."
              >
                <div className={refreshingClass}>
                  <InteractiveTicketChart data={ticketChartData} formatRevenue={formatCents} />
                </div>
              </AnalyticsChartCard>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Cómo te pagan y cómo piden</h2>
            <p className={styles.sectionIntro}>
              Entiende de dónde viene tu dinero: método de pago y tipo de servicio.
            </p>
            <div className={styles.chartGrid}>
              <AnalyticsChartCard
                title="Ingresos por método de pago"
                subtitle="Qué forma de pago te deja más dinero."
              >
                <div className={refreshingClass}>
                  <InteractiveHorizontalBarChart
                    data={paymentRevenueBars}
                    formatValue={formatCents}
                  />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Órdenes por método de pago"
                subtitle="Cuántos pedidos usaron cada forma de pago."
              >
                <div className={refreshingClass}>
                  <InteractiveDonutChart
                    segments={paymentSegments}
                    centerLabel="Órdenes"
                    centerValue={String(summary.order_count)}
                  />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Ingresos por tipo de servicio"
                subtitle="Entrega a domicilio vs para llevar."
              >
                <div className={refreshingClass}>
                  <InteractiveHorizontalBarChart
                    data={orderTypeRevenueBars}
                    formatValue={formatCents}
                  />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Órdenes por tipo de servicio"
                subtitle="Cuántos pedidos fueron entrega o para llevar."
              >
                <div className={refreshingClass}>
                  <InteractiveDonutChart
                    segments={orderTypeSegments}
                    centerLabel="Órdenes"
                    centerValue={String(summary.order_count)}
                  />
                </div>
              </AnalyticsChartCard>
            </div>
          </section>

          {topProductChartData.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Tus productos estrella</h2>
              <p className={styles.sectionIntro}>
                Descubre qué platillos mueven más unidades y cuáles generan más ingresos.
              </p>
              <div className={styles.chartGrid}>
                <AnalyticsChartCard
                  title="Más vendidos por unidades"
                  subtitle="Cantidad de piezas vendidas."
                >
                  <div className={refreshingClass}>
                    <InteractiveProductBarChart
                      data={topProductChartData}
                      formatRevenue={formatCents}
                    />
                  </div>
                </AnalyticsChartCard>

                <AnalyticsChartCard
                  title="Más vendidos por ingresos"
                  subtitle="Productos que más dinero te dejaron."
                >
                  <div className={refreshingClass}>
                    <InteractiveHorizontalBarChart
                      data={topProductRevenueBars}
                      formatValue={formatCents}
                    />
                  </div>
                </AnalyticsChartCard>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tus clientes</h2>
            <p className={styles.sectionIntro}>
              Conoce quién te compra, quién regresa y quién más te ha gastado.
            </p>
            <div className={styles.chartGrid}>
              <AnalyticsChartCard
                title="Frecuencia de compra"
                subtitle="Clientes con una orden vs varias órdenes."
              >
                <div className={refreshingClass}>
                  <InteractiveDonutChart
                    segments={customerMixSegments}
                    centerLabel="Clientes"
                    centerValue={String(customerStats?.unique_customers ?? 0)}
                  />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Top clientes por gasto"
                subtitle="Quién más dinero dejó en el periodo."
              >
                <div className={refreshingClass}>
                  <InteractiveHorizontalBarChart
                    data={topCustomerBars}
                    formatValue={formatCents}
                    emptyMessage="Aún no hay clientes con órdenes entregadas."
                  />
                </div>
              </AnalyticsChartCard>
            </div>

            <div className={`${styles.miniStatsRow} ${refreshingClass ?? ''}`}>
              <div className={styles.miniStatCard}>
                <PersonAddOutlinedIcon fontSize="small" />
                <div>
                  <span className={styles.miniStatLabel}>Nuevos clientes</span>
                  <span className={styles.miniStatValue}>{customerStats?.new_customers ?? 0}</span>
                </div>
              </div>
              <div className={styles.miniStatCard}>
                <WorkspacePremiumOutlinedIcon fontSize="small" />
                <div>
                  <span className={styles.miniStatLabel}>Clientes recurrentes</span>
                  <span className={styles.miniStatValue}>{customerStats?.repeat_customers ?? 0}</span>
                </div>
              </div>
              <div className={styles.miniStatCard}>
                <GroupOutlinedIcon fontSize="small" />
                <div>
                  <span className={styles.miniStatLabel}>Clientes únicos</span>
                  <span className={styles.miniStatValue}>{customerStats?.unique_customers ?? 0}</span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Promociones y operación</h2>
            <p className={styles.sectionIntro}>
              Revisa si tus promos se usan y qué pasa con pedidos en curso o cancelados.
            </p>
            <div className={styles.chartGrid}>
              <AnalyticsChartCard
                title="Uso de promociones"
                subtitle="Cuántas veces se aplicó cada promoción."
              >
                <div className={refreshingClass}>
                  <InteractiveHorizontalBarChart
                    data={promoUsageBars}
                    formatValue={(value) => String(value)}
                    valueSuffix="usos"
                    emptyMessage="No hay promociones activas ni uso registrado."
                  />
                </div>
              </AnalyticsChartCard>

              <AnalyticsChartCard
                title="Operación del día"
                subtitle="Lo que aún está pendiente y lo que se canceló."
              >
                <div className={`${styles.opsGrid} ${refreshingClass ?? ''}`}>
                  <div className={styles.opsCard}>
                    <PendingActionsOutlinedIcon fontSize="small" />
                    <span className={styles.opsLabel}>Órdenes en curso</span>
                    <span className={styles.opsValue}>{summary.pending_orders}</span>
                    <span className={styles.opsHelp}>Pendientes, confirmadas o en preparación</span>
                  </div>
                  <div className={styles.opsCard}>
                    <DiscountOutlinedIcon fontSize="small" />
                    <span className={styles.opsLabel}>Descuentos del periodo</span>
                    <span className={styles.opsValue}>{formatCents(summary.total_discount_cents)}</span>
                    <span className={styles.opsHelp}>Total descontado en órdenes entregadas</span>
                  </div>
                  <div className={styles.opsCard}>
                    <LocalShippingOutlinedIcon fontSize="small" />
                    <span className={styles.opsLabel}>Entrega vs para llevar</span>
                    <span className={styles.opsValue}>
                      {orderTypeSegments.map((s) => s.value).join(' / ') || '0'}
                    </span>
                    <span className={styles.opsHelp}>
                      {orderTypeSegments.map((s) => `${s.label}: ${s.value}`).join(' · ') ||
                        'Sin órdenes'}
                    </span>
                  </div>
                </div>
              </AnalyticsChartCard>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
