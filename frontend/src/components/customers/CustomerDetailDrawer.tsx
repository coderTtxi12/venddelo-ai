'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SouthOutlinedIcon from '@mui/icons-material/SouthOutlined';
import NorthOutlinedIcon from '@mui/icons-material/NorthOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import {
  getRestaurantCustomerActivity,
  type RestaurantCustomer,
  type RestaurantCustomerActivity,
  type RestaurantCustomerActivityItem,
} from '@/lib/api/customers';
import { formatMoney } from '@/lib/currency';
import {
  type ActivityChartBucket,
  type ActivityChartMode,
  type ActivityHistorySort,
  buildActivityChartBuckets,
  defaultCustomRange,
  resolveDeliveryMapsUrl,
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
  summaryFromActivity,
  summarizeCustomerActivity,
} from '@/lib/customers/activitySummary';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import { formatOrderDateTime } from '@/lib/orders/orderDisplay';
import { CustomerMenuOrderDetail } from '@/components/customers/CustomerMenuOrderDetail';
import { ListPagination } from '@/components/ui/ListPagination';
import styles from './CustomerDetailDrawer.module.css';

const HISTORY_PAGE_SIZE = 15;

const HISTORY_SORT_OPTIONS: Record<
  ActivityHistorySort,
  { label: string; shortLabel: string; Icon: typeof ScheduleOutlinedIcon }
> = {
  'date-desc': { label: 'Más recientes', shortLabel: 'Recientes', Icon: ScheduleOutlinedIcon },
  'date-asc': { label: 'Más antiguos', shortLabel: 'Antiguos', Icon: HistoryOutlinedIcon },
  'amount-desc': { label: 'Mayor monto', shortLabel: 'Mayor $', Icon: SouthOutlinedIcon },
  'amount-asc': { label: 'Menor monto', shortLabel: 'Menor $', Icon: NorthOutlinedIcon },
};

const HISTORY_SORT_ORDER: ActivityHistorySort[] = [
  'date-desc',
  'date-asc',
  'amount-desc',
  'amount-asc',
];

function CustomerHistorySort({
  value,
  onChange,
}: {
  value: ActivityHistorySort;
  onChange: (next: ActivityHistorySort) => void;
}) {
  return (
    <div className={styles.historySortSection}>
      <span className={styles.historySortLabel} id="customer-history-sort-label">
        Ordenar por
      </span>
      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_event, next: ActivityHistorySort | null) => {
          if (next) onChange(next);
        }}
        aria-labelledby="customer-history-sort-label"
        className={styles.historySortGroup}
        size="small"
      >
        {HISTORY_SORT_ORDER.map((option) => {
          const { label, shortLabel, Icon } = HISTORY_SORT_OPTIONS[option];
          return (
            <ToggleButton
              key={option}
              value={option}
              className={styles.historySortToggle}
              aria-label={label}
            >
              <Icon sx={{ fontSize: 16 }} aria-hidden />
              <span className={styles.historySortTextLong}>{label}</span>
              <span className={styles.historySortTextShort}>{shortLabel}</span>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
    </div>
  );
}

const CHART_MODE_LABELS: Record<ActivityChartMode, string> = {
  '7d': '7 días',
  week: 'Semana',
  month: 'Mes',
  custom: 'Rango',
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

function bucketToneClass(
  bucket: 'delivered' | 'cancelled' | 'in_progress' | 'other',
): string {
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
  const compactLabels = buckets.length > 6;

  if (buckets.length === 0) {
    return <p className={styles.panelHint}>Sin pedidos en el rango seleccionado.</p>;
  }

  return (
    <div className={styles.chartWrap}>
      <div
        className={`${styles.activityChart} ${compactLabels ? styles.activityChartCompact : ''}`}
        role="list"
        aria-label="Pedidos por periodo"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(2.5rem, 1fr))` }}
      >
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
              <span className={styles.chartLabel} title={bucket.label}>
                {compactLabels ? bucket.shortLabel : bucket.label}
              </span>
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

function DeliveryActivityDetail({
  item,
  onBack,
}: {
  item: RestaurantCustomerActivityItem;
  onBack: () => void;
}) {
  const mapsUrl =
    item.delivery_address != null
      ? resolveDeliveryMapsUrl(item.delivery_address, item.delivery_maps_url)
      : null;

  return (
    <div className={styles.orderDetailShell}>
      <div className={styles.orderDetailNav}>
        <button
          type="button"
          className={styles.orderDetailBack}
          aria-label="Volver al historial"
          onClick={onBack}
        >
          <ArrowBackOutlinedIcon sx={{ fontSize: 18 }} />
        </button>
        <div className={styles.orderDetailHeading}>
          <h3 className={styles.orderDetailTitle}>Envío #{item.display_id}</h3>
          <p className={styles.orderDetailSub}>{formatOrderDateTime(item.created_at)}</p>
        </div>
      </div>
      <div className={styles.deliveryDetailCard}>
        <div className={styles.deliveryDetailRow}>
          <span className={styles.deliveryDetailLabel}>Estado</span>
          <span className={`${styles.statusBadge} ${statusToneClass(item.status)}`}>
            {activityStatusLabel(item.kind, item.status)}
          </span>
        </div>
        <div className={styles.deliveryDetailRow}>
          <span className={styles.deliveryDetailLabel}>Monto</span>
          <strong>{formatCents(item.total_cents)}</strong>
        </div>
        {item.delivery_address ? (
          <div className={styles.deliveryDetailBlock}>
            <span className={styles.deliveryDetailLabel}>Dirección</span>
            <p className={styles.deliveryDetailAddress}>{item.delivery_address}</p>
            {mapsUrl ? (
              <a
                className={styles.deliveryDetailMaps}
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <MapOutlinedIcon sx={{ fontSize: 16 }} />
                Abrir en Maps
              </a>
            ) : null}
          </div>
        ) : null}
        <p className={styles.deliveryDetailHint}>
          Los envíos manuales no incluyen detalle de productos como los pedidos del menú digital.
        </p>
      </div>
    </div>
  );
}

type CustomerDetailDrawerProps = {
  customer: RestaurantCustomer;
  accessToken: string;
  restaurantId: string;
};

export function CustomerDetailDrawer({
  customer,
  accessToken,
  restaurantId,
}: CustomerDetailDrawerProps) {
  const [activity, setActivity] = useState<RestaurantCustomerActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);
  const [historySort, setHistorySort] = useState<ActivityHistorySort>('date-desc');
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ActivityChartMode>('7d');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [selectedItem, setSelectedItem] = useState<RestaurantCustomerActivityItem | null>(null);
  const requestIdRef = useRef(0);

  const resetHistoryPagination = useCallback(() => {
    setListCursor(null);
    setCursorStack([]);
    setNextCursor(null);
  }, []);

  const loadActivity = useCallback(async () => {
    if (!accessToken || !restaurantId) return;
    const requestId = ++requestIdRef.current;
    setActivityLoading(true);
    setActivityError(false);
    setSelectedItem(null);
    try {
      const result = await getRestaurantCustomerActivity(
        accessToken,
        restaurantId,
        customer.phone_key,
        {
          cursor: listCursor,
          limit: HISTORY_PAGE_SIZE,
          sort: historySort,
        },
      );
      if (requestId !== requestIdRef.current) return;
      setActivity(result);
      setNextCursor(result.next_cursor);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setActivityError(true);
      setActivity(null);
    } finally {
      if (requestId === requestIdRef.current) setActivityLoading(false);
    }
  }, [accessToken, customer.phone_key, historySort, listCursor, restaurantId]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const whatsappHref = customerWhatsAppHref(customer.customer_phone, customer.customer_name);
  const summary = useMemo(() => {
    if (!activity) return null;
    if (activity.summary) return summaryFromActivity(customer, activity);
    return summarizeCustomerActivity(customer, activity.items);
  }, [activity, customer]);

  const chartPoints = useMemo(
    () => (activity?.summary.timeline ?? []).map((created_at) => ({ created_at })),
    [activity?.summary.timeline],
  );

  const chartBuckets = useMemo(
    () =>
      buildActivityChartBuckets(
        chartMode,
        chartPoints,
        chartMode === 'custom' ? customRange : undefined,
      ),
    [chartMode, chartPoints, customRange.end, customRange.start],
  );

  const historyItems = activity?.items ?? [];
  const historyTotal = activity?.total ?? 0;
  const historyPage = cursorStack.length + 1;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
  const historyRangeStart =
    historyTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyRangeEnd =
    historyTotal === 0 ? 0 : Math.min((historyPage - 1) * HISTORY_PAGE_SIZE + historyItems.length, historyTotal);

  const averages = activity?.summary
    ? {
        avgTicketCents: activity.summary.avg_ticket_cents,
        avgItemQuantity: activity.summary.avg_item_quantity,
      }
    : { avgTicketCents: null, avgItemQuantity: null };

  const lastAddress = activity?.last_delivery_address ?? null;
  const lastMapsUrl = activity?.last_delivery_maps_url ?? null;

  const totalVisits = summary
    ? summary.menuCount + summary.deliveryCount
    : customer.visit_count;
  const statusTotal = summary
    ? Object.values(summary.statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  function handleHistorySortChange(nextSort: ActivityHistorySort) {
    setHistorySort(nextSort);
    resetHistoryPagination();
  }

  function goToHistoryPage(nextPage: number) {
    const currentPage = cursorStack.length + 1;
    if (nextPage < currentPage && cursorStack.length > 0) {
      const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
      setCursorStack((stack) => stack.slice(0, -1));
      setListCursor(previousCursor);
      return;
    }
    if (nextPage > currentPage && nextCursor) {
      setCursorStack((stack) => [...stack, listCursor]);
      setListCursor(nextCursor);
    }
  }

  async function copyMapsLink() {
    if (!lastMapsUrl) return;
    try {
      await navigator.clipboard.writeText(lastMapsUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  }

  if (selectedItem?.kind === 'delivery') {
    return (
      <DeliveryActivityDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
    );
  }

  if (selectedItem?.kind === 'menu') {
    return (
      <CustomerMenuOrderDetail
        accessToken={accessToken}
        restaurantId={restaurantId}
        orderId={selectedItem.id}
        displayId={selectedItem.display_id}
        customerName={customer.customer_name}
        createdAt={selectedItem.created_at}
        onBack={() => setSelectedItem(null)}
      />
    );
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
                onClick={() => void copyMapsLink()}
                disabled={!lastMapsUrl}
                aria-label="Copiar enlace de Google Maps"
                title={
                  lastMapsUrl
                    ? 'Copia el pin exacto de la última entrega'
                    : 'Sin coordenadas para generar enlace'
                }
              >
                <ContentCopyOutlinedIcon fontSize="inherit" aria-hidden />
                <span className={styles.addressActionLabel}>
                  {copyState === 'copied'
                    ? 'Link copiado'
                    : copyState === 'error'
                      ? 'Error'
                      : 'Copiar'}
                </span>
              </button>
              {lastMapsUrl ? (
                <a
                  className={styles.addressActionBtn}
                  href={lastMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir ubicación en Google Maps"
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

      {summary && !activityLoading && !activityError ? (
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
            </div>

            <ToggleButtonGroup
              exclusive
              value={chartMode}
              onChange={(_event, value: ActivityChartMode | null) => {
                if (!value) return;
                setChartMode(value);
                setSelectedBucketKey(null);
              }}
              aria-label="Periodo de actividad"
              className={styles.chartModeGroup}
              size="small"
            >
              {(Object.keys(CHART_MODE_LABELS) as ActivityChartMode[]).map((mode) => (
                <ToggleButton key={mode} value={mode} className={styles.chartModeToggle}>
                  {CHART_MODE_LABELS[mode]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {chartMode === 'custom' ? (
              <div className={styles.rangeFields}>
                <TextField
                  label="Desde"
                  type="date"
                  size="small"
                  fullWidth
                  value={customRange.start}
                  slotProps={{
                    input: { inputProps: { max: customRange.end } },
                    inputLabel: { shrink: true },
                  }}
                  onChange={(event) => {
                    setCustomRange((prev) => ({ ...prev, start: event.target.value }));
                    setSelectedBucketKey(null);
                  }}
                />
                <TextField
                  label="Hasta"
                  type="date"
                  size="small"
                  fullWidth
                  value={customRange.end}
                  slotProps={{
                    input: { inputProps: { min: customRange.start } },
                    inputLabel: { shrink: true },
                  }}
                  onChange={(event) => {
                    setCustomRange((prev) => ({ ...prev, end: event.target.value }));
                    setSelectedBucketKey(null);
                  }}
                />
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
          <div className={styles.historyHeading}>
            <h3 className={styles.historyTitle}>Historial</h3>
            {historyTotal > 0 ? (
              <span className={styles.historyMeta}>{historyTotal} pedidos</span>
            ) : null}
          </div>
        </div>

        {historyTotal > 0 ? (
          <CustomerHistorySort value={historySort} onChange={handleHistorySortChange} />
        ) : null}

        {activityLoading ? (
          <p className={styles.hint}>Cargando pedidos…</p>
        ) : activityError ? (
          <div className={styles.errorRow}>
            <p>No se pudo cargar el historial.</p>
            <button type="button" className={styles.retryButton} onClick={() => void loadActivity()}>
              Reintentar
            </button>
          </div>
        ) : historyItems.length === 0 ? (
          <p className={styles.hint}>Este cliente no tiene pedidos recientes.</p>
        ) : (
          <>
            <ul className={styles.activityList}>
              {historyItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={styles.activityItem}
                    aria-label={`Ver pedido ${item.display_id}`}
                    onClick={() => setSelectedItem(item)}
                  >
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
                      <span className={styles.activityWhen}>
                        {formatOrderDateTime(item.created_at)}
                      </span>
                      <span className={styles.activityMeta}>
                        {(item.item_quantity ?? 0) > 0 ? `${item.item_quantity} items · ` : ''}
                        <span
                          className={`${styles.activityAmount} ${
                            item.status !== 'delivered' ? styles.activityAmountMuted : ''
                          }`}
                        >
                          {formatCents(item.total_cents)}
                        </span>
                        <ChevronRightOutlinedIcon
                          className={styles.activityChevron}
                          sx={{ fontSize: 18 }}
                          aria-hidden
                        />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <ListPagination
              page={historyPage}
              totalPages={historyTotalPages}
              totalItems={historyTotal}
              rangeStart={historyRangeStart}
              rangeEnd={historyRangeEnd}
              pageSize={HISTORY_PAGE_SIZE}
              itemLabel="pedidos"
              loading={activityLoading}
              onPageChange={goToHistoryPage}
              className={styles.historyPagination}
            />
          </>
        )}
      </section>
    </div>
  );
}
