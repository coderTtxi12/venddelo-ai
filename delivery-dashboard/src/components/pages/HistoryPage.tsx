'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistoryDetailDrawer } from '@/components/history/HistoryDetailDrawer';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { FormSelect } from '@/components/ui/FormSelect';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyDispatchHistory, listMyDeliveryDrivers } from '@/lib/api/deliveryProviders';
import { listActivePartnerships } from '@/lib/api/partnerships';
import { ApiError } from '@/lib/api/types';
import type { DeliveryDriver, DeliveryPartnershipRequest, DispatchHistoryItem } from '@/lib/api/types';
import { historyDateRange, type HistoryPeriod } from '@/lib/dispatch/historyPeriod';
import {
  customerCollectCents,
  formatDateTime,
  formatShortId,
  paymentLabel,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import panelStyles from './PartnershipsPage.module.css';
import styles from './HistoryPage.module.css';

const PERIODS: Array<{ id: HistoryPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Rango' },
];

function packageLine(item: DispatchHistoryItem): string {
  const count = item.package_count ?? 1;
  const size = item.package_size === 'grande' ? 'Grande' : 'Normal';
  return `${count} · ${size}`;
}

function driverLabel(driver: DeliveryDriver): string {
  return `${driver.first_name} ${driver.last_name}`.trim() || driver.email;
}

export default function HistoryPage() {
  const { accessToken } = useAuth();
  const { isAllZones, selectedZoneId, loading: zonesLoading } = useDeliveryZone();
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(null);
  const [status, setStatus] = useState<'' | 'delivered' | 'cancelled'>('');
  const [driverId, setDriverId] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [partnerships, setPartnerships] = useState<DeliveryPartnershipRequest[]>([]);
  const [items, setItems] = useState<DispatchHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [earningsCents, setEarningsCents] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DispatchHistoryItem | null>(null);

  const range = useMemo(() => {
    if (period === 'custom') {
      if (appliedCustom) return appliedCustom;
      const now = new Date();
      return historyDateRange('today', now);
    }
    return historyDateRange(period, new Date());
  }, [appliedCustom, period]);

  const zoneId = isAllZones ? null : selectedZoneId;

  const loadDrivers = useCallback(async () => {
    if (!accessToken) return;
    try {
      const rows = await listMyDeliveryDrivers(accessToken);
      setDrivers(rows);
    } catch {
      setDrivers([]);
    }
  }, [accessToken]);

  const loadPartnerships = useCallback(async () => {
    if (!accessToken) return;
    try {
      const rows = await listActivePartnerships(accessToken);
      setPartnerships(rows);
    } catch {
      setPartnerships([]);
    }
  }, [accessToken]);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!accessToken || zonesLoading) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await getMyDispatchHistory(accessToken, {
          start: range.start,
          end: range.end,
          status: status || undefined,
          driverId: driverId || null,
          restaurantId: restaurantId || null,
          zoneId,
          limit: 50,
          offset,
        });
        setItems((current) => (append ? [...current, ...page.items] : page.items));
        setTotal(page.total);
        setDeliveredCount(page.delivered_count);
        setCancelledCount(page.cancelled_count);
        setEarningsCents(page.earnings_cents);
        setHasMore(page.has_more);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'No se pudo cargar el historial.';
        setError(message);
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accessToken, driverId, range.end, range.start, restaurantId, status, zoneId, zonesLoading],
  );

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  useEffect(() => {
    void loadPartnerships();
  }, [loadPartnerships]);

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  const driverOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...drivers.map((driver) => ({ value: driver.id, label: driverLabel(driver) })),
    ],
    [drivers],
  );

  const restaurantOptions = useMemo(() => {
    const visible = isAllZones
      ? partnerships
      : partnerships.filter((row) => row.zone.id === selectedZoneId);
    const unique = new Map<string, string>();
    for (const row of visible) {
      unique.set(row.restaurant.id, row.restaurant.name);
    }
    return [
      { value: '', label: 'Todos' },
      ...[...unique.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'es'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [isAllZones, partnerships, selectedZoneId]);

  useEffect(() => {
    if (!restaurantId) return;
    if (!restaurantOptions.some((option) => option.value === restaurantId)) {
      setRestaurantId('');
    }
  }, [restaurantId, restaurantOptions]);

  function applyCustomRange() {
    if (!customStart || !customEnd) return;
    if (customEnd < customStart) {
      setError('La fecha final no puede ser anterior a la inicial');
      return;
    }
    setPeriod('custom');
    setAppliedCustom({ start: customStart, end: customEnd });
  }

  return (
    <PanelPageShell
      title="Historial"
      subtitle="Pedidos entregados y cancelados"
      styles={panelStyles as PanelPageStyles}
    >
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.filters}>
        <div className={panelStyles.tabs} role="tablist" aria-label="Periodo">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={period === option.id}
              className={`${panelStyles.tab} ${period === option.id ? panelStyles.tabActive : ''}`}
              onClick={() => {
                if (option.id === 'custom') {
                  setCustomStart((current) => current || range.start);
                  setCustomEnd((current) => current || range.end);
                  setAppliedCustom((current) => current ?? { start: range.start, end: range.end });
                  setPeriod('custom');
                  return;
                }
                setPeriod(option.id);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className={styles.rangeRow}>
            <label className={styles.dateField}>
              <span>Desde</span>
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label className={styles.dateField}>
              <span>Hasta</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
            <button type="button" className={styles.applyButton} onClick={applyCustomRange}>
              Aplicar
            </button>
          </div>
        ) : null}

        <div className={styles.selects}>
          <div className={styles.filterField}>
            <span id="history-restaurant-label">Negocio</span>
            <FormSelect
              id="history-restaurant"
              aria-labelledby="history-restaurant-label"
              value={restaurantId}
              options={restaurantOptions}
              onChange={setRestaurantId}
            />
          </div>
          <div className={styles.filterField}>
            <span id="history-driver-label">Repartidor</span>
            <FormSelect
              id="history-driver"
              aria-labelledby="history-driver-label"
              value={driverId}
              options={driverOptions}
              onChange={setDriverId}
            />
          </div>
          <div className={styles.filterField}>
            <span id="history-status-label">Estado</span>
            <FormSelect
              id="history-status"
              aria-labelledby="history-status-label"
              value={status}
              options={[
                { value: '', label: 'Todos' },
                { value: 'delivered', label: 'Entregados' },
                { value: 'cancelled', label: 'Cancelados' },
              ]}
              onChange={(value) => setStatus(value as '' | 'delivered' | 'cancelled')}
            />
          </div>
        </div>
      </div>

      <p className={styles.summary}>
        {deliveredCount} entregados · {cancelledCount} cancelados · tarifas{' '}
        {formatMoney(earningsCents)}
      </p>

      {loading && items.length === 0 ? (
        <div className={styles.empty}>Cargando historial…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No hay pedidos cerrados en este periodo.</p>
        </div>
      ) : (
        <>
          <div className={`${styles.tableWrap} ${loading ? styles.dimmed : ''}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cierre</th>
                  <th>#</th>
                  <th>Estado</th>
                  <th>Restaurante</th>
                  <th>Cliente</th>
                  <th>Dropoff</th>
                  <th>Repartidor</th>
                  <th>Zona</th>
                  <th>Pago</th>
                  <th>Cobro</th>
                  <th>Tarifa</th>
                  <th>Paquetes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={styles.row}
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(item);
                      }
                    }}
                  >
                    <td>{formatDateTime(item.closed_at) ?? '—'}</td>
                    <td>{formatShortId(item.short_id) || '—'}</td>
                    <td>
                      <span
                        className={`${styles.status} ${
                          item.status === 'delivered' ? styles.statusOk : styles.statusMuted
                        }`}
                      >
                        {requestStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>{item.restaurant_name}</td>
                    <td>{item.customer_name || '—'}</td>
                    <td className={styles.dropoff}>{item.dropoff_address}</td>
                    <td>{item.assigned_driver_name || '—'}</td>
                    <td>{item.zone_name || '—'}</td>
                    <td>{paymentLabel(item.payment_method)}</td>
                    <td>
                      {item.payment_method === 'transfer'
                        ? '—'
                        : formatMoney(customerCollectCents(item))}
                    </td>
                    <td>{formatMoney(item.quoted_fee_cents)}</td>
                    <td>{packageLine(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={`${styles.cards} ${loading ? styles.dimmed : ''}`}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.card}
                  onClick={() => setSelected(item)}
                >
                  <div className={styles.cardTop}>
                    <strong>{formatShortId(item.short_id) || 'Pedido'}</strong>
                    <span
                      className={`${styles.status} ${
                        item.status === 'delivered' ? styles.statusOk : styles.statusMuted
                      }`}
                    >
                      {requestStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className={styles.cardTitle}>{item.restaurant_name}</p>
                  <p className={styles.cardMeta}>{item.dropoff_address}</p>
                  <p className={styles.cardMeta}>
                    {formatDateTime(item.closed_at)} · {item.assigned_driver_name || 'Sin repartidor'}
                  </p>
                  <p className={styles.cardMeta}>
                    {paymentLabel(item.payment_method)}
                    {item.payment_method !== 'transfer'
                      ? ` · cobro ${formatMoney(customerCollectCents(item))}`
                      : ''}
                    {' · '}tarifa {formatMoney(item.quoted_fee_cents)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <button
              type="button"
              className={styles.loadMore}
              disabled={loadingMore}
              onClick={() => void loadPage(items.length, true)}
            >
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </>
      )}

      {items.length > 0 ? (
        <p className={styles.totalHint}>{total} pedidos en este periodo</p>
      ) : null}

      <HistoryDetailDrawer
        open={selected !== null}
        item={selected}
        accessToken={accessToken}
        onClose={() => setSelected(null)}
      />
    </PanelPageShell>
  );
}
