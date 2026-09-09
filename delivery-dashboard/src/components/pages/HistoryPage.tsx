'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { HistoryDetailDrawer } from '@/components/history/HistoryDetailDrawer';
import { EntityFilterCombobox } from '@/components/history/EntityFilterCombobox';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { FormSelect } from '@/components/ui/FormSelect';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyDispatchHistory, listMyDeliveryDrivers } from '@/lib/api/deliveryProviders';
import { listActivePartnerships } from '@/lib/api/partnerships';
import { ApiError } from '@/lib/api/types';
import type { DeliveryDriver, DeliveryPartnershipRequest, DispatchHistoryItem } from '@/lib/api/types';
import {
  HISTORY_PAGE_SIZE,
  historyEmptyHint,
  historyEmptyTitle,
  historyPageRangeLabel,
  historySearchScopeHint,
  normalizeHistoryQuery,
  type HistoryEntityMode,
} from '@/lib/dispatch/historyFilters';
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
  { id: 'yesterday', label: 'Ayer' },
  { id: 'day_before', label: 'Antier' },
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
  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [driverMode, setDriverMode] = useState<HistoryEntityMode>('include');
  const [restaurantIds, setRestaurantIds] = useState<string[]>([]);
  const [restaurantMode, setRestaurantMode] = useState<HistoryEntityMode>('include');
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
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMemo(() => {
    if (period === 'custom') {
      if (appliedCustom) return appliedCustom;
      const now = new Date();
      return historyDateRange('today', now);
    }
    return historyDateRange(period, new Date());
  }, [appliedCustom, period]);

  const zoneId = isAllZones ? null : selectedZoneId;

  const visibleRestaurantIds = useMemo(() => {
    const visible = isAllZones
      ? partnerships
      : partnerships.filter((row) => row.zone.id === selectedZoneId);
    return new Set(visible.map((row) => row.restaurant.id));
  }, [isAllZones, partnerships, selectedZoneId]);

  const restaurantFilterIds = useMemo(
    () => restaurantIds.filter((id) => visibleRestaurantIds.has(id)),
    [restaurantIds, visibleRestaurantIds],
  );

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
      const collected: DeliveryPartnershipRequest[] = [];
      let offset = 0;
      for (;;) {
        const page = await listActivePartnerships(accessToken, {
          limit: 100,
          offset,
          sort: 'name',
        });
        collected.push(...page.items);
        if (!page.has_more || page.items.length === 0) break;
        offset += page.items.length;
      }
      setPartnerships(collected);
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
          q: query || undefined,
          status: status || undefined,
          driverIds,
          driverMode,
          restaurantIds: restaurantFilterIds,
          restaurantMode,
          zoneId,
          limit: HISTORY_PAGE_SIZE,
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
    [accessToken, driverIds, driverMode, query, range.end, range.start, restaurantFilterIds, restaurantMode, status, zoneId, zonesLoading],
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

  useEffect(() => {
    return () => {
      if (queryTimer.current) clearTimeout(queryTimer.current);
    };
  }, []);

  function commitQuery(raw: string) {
    setQuery(normalizeHistoryQuery(raw));
  }

  function handleQueryChange(raw: string) {
    setQueryInput(raw);
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => commitQuery(raw), 300);
  }

  function clearQuery() {
    if (queryTimer.current) clearTimeout(queryTimer.current);
    setQueryInput('');
    setQuery('');
  }

  const searching = Boolean(query);
  const searchHint = historySearchScopeHint(query);
  const emptyHint = historyEmptyHint(query);

  const driverOptions = useMemo(
    () =>
      drivers.map((driver) => ({
        id: driver.id,
        label: driverLabel(driver),
      })),
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
    return [...unique.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([id, label]) => ({ id, label }));
  }, [isAllZones, partnerships, selectedZoneId]);

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
        <form
          className={styles.searchField}
          onSubmit={(event) => {
            event.preventDefault();
            if (queryTimer.current) clearTimeout(queryTimer.current);
            commitQuery(queryInput);
          }}
        >
          <label htmlFor="history-order-id">ID del pedido</label>
          <div className={styles.searchBox}>
            <SearchOutlinedIcon sx={{ fontSize: 20 }} className={styles.searchIcon} aria-hidden />
            <input
              id="history-order-id"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={queryInput}
              placeholder="#BDE4E"
              aria-describedby={searchHint ? 'history-search-hint' : 'history-search-help'}
              onChange={(event) => handleQueryChange(event.target.value)}
            />
            {queryInput ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Borrar búsqueda"
                onClick={clearQuery}
              >
                <CloseOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
              </button>
            ) : null}
          </div>
          {searchHint ? (
            <p id="history-search-hint" className={styles.searchHint}>
              {searchHint}
            </p>
          ) : (
            <p id="history-search-help" className={styles.searchHint}>
              Busca por ID en todo el historial, por ejemplo #BDE4E.
            </p>
          )}
        </form>

        <div
          className={`${styles.periodRow} ${searching ? styles.periodRowMuted : ''}`}
          role="tablist"
          aria-label="Periodo"
          aria-disabled={searching}
        >
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={period === option.id}
              className={`${styles.periodChip} ${period === option.id ? styles.periodChipActive : ''}`}
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
            <EntityFilterCombobox
              id="history-restaurant"
              labelledBy="history-restaurant-label"
              options={restaurantOptions}
              selectedIds={restaurantFilterIds}
              mode={restaurantMode}
              placeholder="Escribe un restaurante"
              onChange={({ ids, mode }) => {
                setRestaurantIds(ids);
                setRestaurantMode(mode);
              }}
            />
          </div>
          <div className={styles.filterField}>
            <span id="history-driver-label">Repartidor</span>
            <EntityFilterCombobox
              id="history-driver"
              labelledBy="history-driver-label"
              options={driverOptions}
              selectedIds={driverIds}
              mode={driverMode}
              placeholder="Escribe un repartidor"
              onChange={({ ids, mode }) => {
                setDriverIds(ids);
                setDriverMode(mode);
              }}
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
          <p className={styles.emptyTitle}>{historyEmptyTitle(query)}</p>
          {emptyHint ? <p className={styles.emptyHint}>{emptyHint}</p> : null}
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
                    {(item.mexy_fee_cents ?? 0) > 0
                      ? ` · Mexy ${formatMoney(item.mexy_fee_cents ?? 0)}`
                      : ''}
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
        <p className={styles.totalHint}>{historyPageRangeLabel(0, items.length, total)}</p>
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
