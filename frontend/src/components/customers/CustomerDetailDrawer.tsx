'use client';

import { useMemo, useState } from 'react';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { RestaurantCustomer, RestaurantCustomerActivity } from '@/lib/api/customers';
import { formatMoney } from '@/lib/currency';
import {
  type ActivityChartBucket,
  type ActivityChartMode,
  type ActivityHistorySort,
  buildCustomActivityBuckets,
  buildWeeklyActivityBuckets,
  computeAverageOrderMetrics,
  defaultCustomRange,
  resolveDeliveryMapsUrl,
  sortActivityHistory,
} from '@/lib/customers/activityChart';
import {
  activityKindLabel,
  activityStatusLabel,
  customerInitials,
  customerWhatsAppHref,
} from '@/lib/customers/display';
import {
  activityStatusBucketLabel,
  channelLabel,
  classifyActivityStatus,
  summarizeCustomerActivity,
} from '@/lib/customers/activitySummary';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderDateTime } from '@/lib/orders/orderDisplay';
import { ToolbarSelect } from '@/components/ui/ToolbarSelect';
import styles from './CustomerDetailDrawer.module.css';

const HISTORY_SORT_OPTIONS: Record<ActivityHistorySort, string> = {
  'date-desc': 'Más recientes',
  'date-asc': 'Más antiguos',
  'amount-desc': 'Mayor monto',
  'amount-asc': 'Menor monto',
};

function formatCents(cents: number) {
  return formatMoney(cents / 100);
}

function statusToneClass(status: string): string {
  const bucket = classifyActivityStatus(status);
  if (bucket === 'delivered') return styles.statusDelivered;
  if (bucket === 'cancelled') return styles.statusCancelled;
  if (bucket === 'in_progress') return styles.statusProgress;
  return styles.statusOther;
}

function bucketToneClass(bucket: keyof ReturnType<typeof summarizeCustomerActivity>['statusCounts']): string {
  if (bucket === 'delivered') return styles.legendDelivered;
  if (bucket === 'cancelled') return styles.legendCancelled;
  if (bucket === 'in_progress') return styles.legendProgress;
  return styles.legendOther;
}

function ActivityChart({
  buckets,
  selectedKey,
  onSelect,
}: {
  buckets: ActivityChartBucket[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

  if (buckets.length === 0) {
    return <p className={styles.panelHint}>Sin pedidos en el rango seleccionado.</p>;
  }

  return (
    <div className={styles.chartWrap}>
      <div className={styles.activityChart} role="list" aria-label="Pedidos por periodo">
        {buckets.map((bucket) => {
          const selected = selectedKey === bucket.key;
          return (
            <button
              key={bucket.key}
              type="button"
              role="listitem"
              className={`${styles.chartCol} ${selected ? styles.chartColSelected : ''}`}
              aria-pressed={selected}
              aria-label={`${bucket.label}: ${bucket.count} pedidos`}
              onClick={() => onSelect(selected ? null : bucket.key)}
            >
              <div className={styles.chartBarTrack}>
                <span
                  className={styles.chartBarFill}
                  style={{ height: `${(bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className={styles.chartCount}>{bucket.count || '·'}</span>
              <span className={styles.chartLabel}>{bucket.label}</span>
            </button>
          );
        })}
      </div>
      {selectedKey ? (
        <p className={styles.chartSelection} aria-live="polite">
          {(() => {
            const bucket = buckets.find((item) => item.key === selectedKey);
            if (!bucket) return null;
            return `${bucket.label}: ${bucket.count} pedido${bucket.count === 1 ? '' : 's'}`;
          })()}
        </p>
      ) : (
        <p className={styles.chartHint}>Toca una barra para ver el detalle del periodo.</p>
      )}
    </div>
  );
}

type CustomerDetailDrawerProps = {
  customer: RestaurantCustomer;
  activity: RestaurantCustomerActivity | 'loading' | 'error' | null;
  onRetryActivity: () => void;
};

export function CustomerDetailDrawer({
  customer,
  activity,
  onRetryActivity,
}: CustomerDetailDrawerProps) {
  const [chartMode, setChartMode] = useState<ActivityChartMode>('week');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [historySort, setHistorySort] = useState<ActivityHistorySort>('date-desc');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const whatsappHref = customerWhatsAppHref(customer.customer_phone, customer.customer_name);
  const items = activity && activity !== 'loading' && activity !== 'error' ? activity.items : [];
  const summary = useMemo(
    () => (items.length > 0 ? summarizeCustomerActivity(customer, items) : null),
    [customer, items],
  );
  const averages = useMemo(() => computeAverageOrderMetrics(items), [items]);
  const sortedHistory = useMemo(
    () => sortActivityHistory(items, historySort),
    [historySort, items],
  );

  const chartBuckets = useMemo(() => {
    if (chartMode === 'week') return buildWeeklyActivityBuckets(items);
    return buildCustomActivityBuckets(items, customRange.start, customRange.end);
  }, [chartMode, customRange.end, customRange.start, items]);

  const totalVisits = summary
    ? summary.menuCount + summary.deliveryCount
    : customer.visit_count;
  const statusTotal = summary
    ? Object.values(summary.statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  const lastAddress =
    activity && activity !== 'loading' && activity !== 'error'
      ? activity.last_delivery_address
      : null;
  const lastMapsUrl =
    activity && activity !== 'loading' && activity !== 'error' && lastAddress
      ? resolveDeliveryMapsUrl(lastAddress, activity.last_delivery_maps_url)
      : null;

  async function copyAddress() {
    if (!lastAddress) return;
    try {
      await navigator.clipboard.writeText(lastAddress);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.hero}>
        <span className={styles.avatar} aria-hidden>
          {customerInitials(customer.customer_name)}
        </span>
        <div className={styles.heroCopy}>
          <p className={styles.phone}>{formatOrderCustomerPhone(customer.customer_phone)}</p>
          <p className={styles.meta}>
            Cliente desde {formatOrderDateTime(customer.first_order_at)}
          </p>
        </div>
        {whatsappHref ? (
          <a
            className={styles.whatsapp}
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir WhatsApp con ${customer.customer_name || 'cliente'}`}
          >
            <WhatsAppIcon fontSize="small" aria-hidden />
            <span className={styles.whatsappLabel}>WhatsApp</span>
          </a>
        ) : null}
      </div>

      {lastAddress ? (
        <section className={styles.addressCard} aria-label="Última dirección de entrega">
          <div className={styles.addressHeader}>
            <h3 className={styles.addressTitle}>Última dirección</h3>
            <div className={styles.addressActions}>
              <button
                type="button"
                className={styles.addressActionBtn}
                onClick={() => void copyAddress()}
                aria-label="Copiar dirección"
              >
                <ContentCopyOutlinedIcon fontSize="inherit" aria-hidden />
                <span className={styles.addressActionLabel}>
                  {copyState === 'copied' ? 'Copiado' : copyState === 'error' ? 'Error' : 'Copiar'}
                </span>
              </button>
              {lastMapsUrl ? (
                <a
                  className={styles.addressActionBtn}
                  href={lastMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir dirección en Google Maps"
                >
                  <MapOutlinedIcon fontSize="inherit" aria-hidden />
                  <span className={styles.addressActionLabel}>Maps</span>
                </a>
              ) : null}
            </div>
          </div>
          <p className={styles.addressText}>{lastAddress}</p>
        </section>
      ) : null}

      <section className={styles.spentCard} aria-label="Gasto del cliente">
        <div className={styles.spentMain}>
          <span className={styles.spentLabel}>Gastado</span>
          <strong className={styles.spentValue}>{formatCents(customer.total_spent_cents)}</strong>
        </div>
        <p className={styles.spentHint}>Solo suma pedidos entregados.</p>
        {averages.avgTicketCents != null || averages.avgItemQuantity != null ? (
          <div className={styles.avgGrid}>
            {averages.avgTicketCents != null ? (
              <div className={styles.avgMetric}>
                <span className={styles.avgLabel}>Ticket promedio</span>
                <strong className={styles.avgValue}>{formatCents(averages.avgTicketCents)}</strong>
              </div>
            ) : null}
            {averages.avgItemQuantity != null ? (
              <div className={styles.avgMetric}>
                <span className={styles.avgLabel}>Items promedio</span>
                <strong className={styles.avgValue}>{averages.avgItemQuantity}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {summary ? (
        <>
          <section className={styles.panel} aria-label="Pedidos por canal">
            <h3 className={styles.panelTitle}>Por canal</h3>
            <div className={styles.channelGrid}>
              <div className={styles.channelCard}>
                <span className={`${styles.channelDot} ${styles.channelMenu}`} aria-hidden />
                <div>
                  <span className={styles.channelLabel}>{channelLabel('menu')}</span>
                  <strong className={styles.channelValue}>{summary.menuCount}</strong>
                </div>
              </div>
              <div className={styles.channelCard}>
                <span className={`${styles.channelDot} ${styles.channelDelivery}`} aria-hidden />
                <div>
                  <span className={styles.channelLabel}>{channelLabel('delivery')}</span>
                  <strong className={styles.channelValue}>{summary.deliveryCount}</strong>
                </div>
              </div>
            </div>
            {totalVisits > 0 ? (
              <div
                className={styles.splitBar}
                role="img"
                aria-label={`${summary.menuCount} del menú digital y ${summary.deliveryCount} de delivery manual`}
              >
                <span
                  className={styles.splitMenu}
                  style={{ width: `${(summary.menuCount / totalVisits) * 100}%` }}
                />
                <span
                  className={styles.splitDelivery}
                  style={{ width: `${(summary.deliveryCount / totalVisits) * 100}%` }}
                />
              </div>
            ) : null}
          </section>

          <section className={styles.panel} aria-label="Estado de pedidos">
            <h3 className={styles.panelTitle}>Estado</h3>
            {statusTotal > 0 ? (
              <>
                <div
                  className={styles.statusBar}
                  role="img"
                  aria-label={[
                    `${summary.statusCounts.delivered} entregados`,
                    `${summary.statusCounts.cancelled} cancelados`,
                    `${summary.statusCounts.in_progress} en curso`,
                  ].join(', ')}
                >
                  {(['delivered', 'cancelled', 'in_progress', 'other'] as const).map((bucket) =>
                    summary.statusCounts[bucket] > 0 ? (
                      <span
                        key={bucket}
                        className={bucketToneClass(bucket)}
                        style={{ width: `${(summary.statusCounts[bucket] / statusTotal) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className={styles.legend}>
                  {(['delivered', 'cancelled', 'in_progress'] as const).map((bucket) =>
                    summary.statusCounts[bucket] > 0 ? (
                      <li key={bucket}>
                        <span className={`${styles.legendSwatch} ${bucketToneClass(bucket)}`} aria-hidden />
                        <span>{activityStatusBucketLabel(bucket)}</span>
                        <strong>{summary.statusCounts[bucket]}</strong>
                      </li>
                    ) : null,
                  )}
                </ul>
              </>
            ) : (
              <p className={styles.panelHint}>Sin pedidos registrados.</p>
            )}
          </section>

          <section className={styles.panel} aria-label="Actividad por periodo">
            <div className={styles.chartHeader}>
              <h3 className={styles.panelTitle}>Actividad</h3>
              <div className={styles.chartModeToggle} role="group" aria-label="Modo de gráfica">
                <button
                  type="button"
                  className={`${styles.chartModeBtn} ${chartMode === 'week' ? styles.chartModeBtnOn : ''}`}
                  aria-pressed={chartMode === 'week'}
                  onClick={() => {
                    setChartMode('week');
                    setSelectedBucketKey(null);
                  }}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  className={`${styles.chartModeBtn} ${chartMode === 'custom' ? styles.chartModeBtnOn : ''}`}
                  aria-pressed={chartMode === 'custom'}
                  onClick={() => {
                    setChartMode('custom');
                    setSelectedBucketKey(null);
                  }}
                >
                  Rango
                </button>
              </div>
            </div>

            {chartMode === 'custom' ? (
              <div className={styles.rangeFields}>
                <label className={styles.rangeField}>
                  <span className={styles.rangeLabel}>Desde</span>
                  <input
                    className={styles.rangeInput}
                    type="date"
                    value={customRange.start}
                    max={customRange.end}
                    onChange={(event) => {
                      setCustomRange((prev) => ({ ...prev, start: event.target.value }));
                      setSelectedBucketKey(null);
                    }}
                  />
                </label>
                <label className={styles.rangeField}>
                  <span className={styles.rangeLabel}>Hasta</span>
                  <input
                    className={styles.rangeInput}
                    type="date"
                    value={customRange.end}
                    min={customRange.start}
                    onChange={(event) => {
                      setCustomRange((prev) => ({ ...prev, end: event.target.value }));
                      setSelectedBucketKey(null);
                    }}
                  />
                </label>
              </div>
            ) : null}

            <ActivityChart
              buckets={chartBuckets}
              selectedKey={selectedBucketKey}
              onSelect={setSelectedBucketKey}
            />
          </section>
        </>
      ) : null}

      <section className={styles.history}>
        <div className={styles.historyHeader}>
          <h3 className={styles.historyTitle}>Historial</h3>
          {items.length > 0 ? (
            <div className={styles.historySort}>
              <ToolbarSelect
                label="Ordenar"
                value={historySort}
                options={HISTORY_SORT_OPTIONS}
                onChange={(value) => setHistorySort(value as ActivityHistorySort)}
              />
            </div>
          ) : null}
        </div>
        {activity === 'loading' || activity == null ? (
          <p className={styles.hint}>Cargando pedidos…</p>
        ) : activity === 'error' ? (
          <div className={styles.errorRow}>
            <p>No se pudo cargar el historial.</p>
            <button type="button" className={styles.retryButton} onClick={onRetryActivity}>
              Reintentar
            </button>
          </div>
        ) : sortedHistory.length === 0 ? (
          <p className={styles.hint}>Este cliente no tiene pedidos recientes.</p>
        ) : (
          <ul className={styles.activityList}>
            {sortedHistory.map((item) => (
              <li key={`${item.kind}-${item.id}`} className={styles.activityItem}>
                <div className={styles.activityTop}>
                  <span className={styles.activityId}>#{item.display_id}</span>
                  <span className={styles.activityKind}>
                    {activityKindLabel(item.kind, item.order_type)}
                  </span>
                  <span className={`${styles.statusBadge} ${statusToneClass(item.status)}`}>
                    {activityStatusLabel(item.kind, item.status)}
                  </span>
                </div>
                <div className={styles.activityBottom}>
                  <span className={styles.activityWhen}>{formatOrderDateTime(item.created_at)}</span>
                  <span className={styles.activityMeta}>
                    {(item.item_quantity ?? 0) > 0 ? `${item.item_quantity} items · ` : ''}
                    <span
                      className={`${styles.activityAmount} ${
                        item.status !== 'delivered' ? styles.activityAmountMuted : ''
                      }`}
                      title={
                        item.status !== 'delivered'
                          ? 'Solo los entregados suman al gasto'
                          : undefined
                      }
                    >
                      {formatCents(item.total_cents)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
