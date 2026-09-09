'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { EntityFilterCombobox } from '@/components/history/EntityFilterCombobox';
import { HistoryDetailDrawer } from '@/components/history/HistoryDetailDrawer';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { StatsPeakHours } from '@/components/stats/StatsPeakHours';
import { StatsRankChart } from '@/components/stats/StatsRankChart';
import { StatsSourceDonut } from '@/components/stats/StatsSourceDonut';
import { StatsStackedChart } from '@/components/stats/StatsStackedChart';
import { StatsTrendChart } from '@/components/stats/StatsTrendChart';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyDispatchStats, listMyDeliveryDrivers } from '@/lib/api/deliveryProviders';
import { listActivePartnerships } from '@/lib/api/partnerships';
import { ApiError } from '@/lib/api/types';
import type {
  DeliveryDriver,
  DeliveryPartnershipRequest,
  DispatchHistoryItem,
  DispatchStats,
} from '@/lib/api/types';
import {
  comparisonDateRange,
  historyDateRange,
  isSameLengthRange,
  rangeDayCount,
  statsGranularity,
  type HistoryPeriod,
  formatChangePct,
} from '@/lib/dispatch/historyPeriod';
import {
  formatDateTime,
  formatShortId,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import {
  STATS_EXCLUSIONS_KEY,
  normalizeStatsPhone,
  parseStoredExclusions,
  serializeStatsExclusions,
  type StatsExclusions,
} from '@/lib/dispatch/statsExclusions';
import {
  formatIsoDayRange,
  statsChangeTone,
  statsGranularityLabel,
  statsRankPoints,
  statsSourceSegments,
  statsTrendPoints,
} from '@/lib/dispatch/statsView';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import panelStyles from './PartnershipsPage.module.css';
import historyStyles from './HistoryPage.module.css';
import styles from './StatsPage.module.css';

const PERIODS: Array<{ id: HistoryPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'day_before', label: 'Antier' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Rango' },
];

function changeClass(pct: number | null | undefined): string {
  const tone = statsChangeTone(pct);
  if (tone === 'up') return styles.up;
  if (tone === 'down') return styles.down;
  return styles.flat;
}

function driverLabel(driver: DeliveryDriver): string {
  return `${driver.first_name} ${driver.last_name}`.trim() || driver.email;
}

export default function StatsPage() {
  const { accessToken } = useAuth();
  const { isAllZones, selectedZoneId, loading: zonesLoading } = useDeliveryZone();
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(null);
  const [compareManual, setCompareManual] = useState(false);
  const [compareStart, setCompareStart] = useState('');
  const [compareEnd, setCompareEnd] = useState('');
  const [exclusions, setExclusions] = useState<StatsExclusions>(() => {
    if (typeof window === 'undefined') {
      return { restaurantIds: [], driverIds: [], phones: [] };
    }
    return parseStoredExclusions(window.localStorage.getItem(STATS_EXCLUSIONS_KEY));
  });
  const [phoneDraft, setPhoneDraft] = useState('');
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [partnerships, setPartnerships] = useState<DeliveryPartnershipRequest[]>([]);
  const [stats, setStats] = useState<DispatchStats | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DispatchHistoryItem | null>(null);

  const range = useMemo(() => {
    if (period === 'custom') {
      if (appliedCustom) return appliedCustom;
      return historyDateRange('today', new Date());
    }
    return historyDateRange(period, new Date());
  }, [appliedCustom, period]);

  const autoCompare = useMemo(
    () => comparisonDateRange(range.start, range.end),
    [range.end, range.start],
  );
  const compareRange = compareManual
    ? { start: compareStart || autoCompare.start, end: compareEnd || autoCompare.end }
    : autoCompare;
  const compareValid = isSameLengthRange(range, compareRange);
  const zoneId = isAllZones ? null : selectedZoneId;
  const queryKey = [
    range.start,
    range.end,
    compareManual ? `${compareRange.start}:${compareRange.end}` : 'auto',
    zoneId ?? 'all',
    exclusions.restaurantIds.join(','),
    exclusions.driverIds.join(','),
    exclusions.phones.join(','),
  ].join('|');

  function persistExclusions(next: StatsExclusions) {
    setExclusions(next);
    window.localStorage.setItem(STATS_EXCLUSIONS_KEY, serializeStatsExclusions(next));
  }

  useEffect(() => {
    if (!accessToken) return;
    void listMyDeliveryDrivers(accessToken).then(setDrivers).catch(() => setDrivers([]));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
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
    })();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || zonesLoading) return;
    if (compareManual && !compareValid) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getMyDispatchStats(accessToken, {
          start: range.start,
          end: range.end,
          compareStart: compareManual ? compareRange.start : null,
          compareEnd: compareManual ? compareRange.end : null,
          zoneId,
          excludeRestaurantIds: exclusions.restaurantIds,
          excludeDriverIds: exclusions.driverIds,
          excludePhones: exclusions.phones,
        });
        if (cancelled) return;
        setError(null);
        setStats(payload);
        setLoadedKey(queryKey);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'No se pudieron cargar las estadísticas.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    compareManual,
    compareRange.end,
    compareRange.start,
    compareValid,
    exclusions.driverIds,
    exclusions.phones,
    exclusions.restaurantIds,
    queryKey,
    range.end,
    range.start,
    zoneId,
    zonesLoading,
  ]);

  function applyCustomRange() {
    if (!customStart || !customEnd) return;
    if (customEnd < customStart) {
      setError('La fecha final no puede ser anterior a la inicial');
      return;
    }
    setPeriod('custom');
    setAppliedCustom({ start: customStart, end: customEnd });
  }

  function addPhone() {
    const phone = normalizeStatsPhone(phoneDraft);
    if (!phone) return;
    persistExclusions({
      ...exclusions,
      phones: exclusions.phones.includes(phone) ? exclusions.phones : [...exclusions.phones, phone],
    });
    setPhoneDraft('');
  }

  const driverOptions = useMemo(
    () => drivers.map((driver) => ({ id: driver.id, label: driverLabel(driver) })),
    [drivers],
  );

  const restaurantOptions = useMemo(() => {
    const visible = isAllZones
      ? partnerships
      : partnerships.filter((row) => row.zone.id === selectedZoneId);
    const unique = new Map<string, string>();
    for (const row of visible) unique.set(row.restaurant.id, row.restaurant.name);
    return [...unique.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([id, label]) => ({ id, label }));
  }, [isAllZones, partnerships, selectedZoneId]);

  const summary = stats?.summary;
  const heatmapCount = (stats?.hour_heatmap ?? []).reduce((sum, cell) => sum + cell.count, 0);
  const empty = Boolean(stats && summary && summary.order_count === 0 && heatmapCount === 0);
  const dimmed = stats !== null && loadedKey !== queryKey;

  return (
    <PanelPageShell
      title="Estadísticas"
      subtitle="Pedidos cerrados, ocupación y comparación de periodos"
      styles={panelStyles as PanelPageStyles}
    >
      {compareManual && !compareValid ? (
        <div className={historyStyles.error} role="alert">
          El periodo a comparar debe durar lo mismo ({rangeDayCount(range.start, range.end)} días).
        </div>
      ) : error ? (
        <div className={historyStyles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.filters}>
        <div className={historyStyles.periodRow} role="tablist" aria-label="Periodo">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={period === option.id}
              className={`${historyStyles.periodChip} ${
                period === option.id ? historyStyles.periodChipActive : ''
              }`}
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
          <div className={historyStyles.rangeRow}>
            <label className={historyStyles.dateField}>
              <span>Desde</span>
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label className={historyStyles.dateField}>
              <span>Hasta</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
            <button type="button" className={historyStyles.applyButton} onClick={applyCustomRange}>
              Aplicar
            </button>
          </div>
        ) : null}

        <div className={styles.compareRow} role="group" aria-label="Comparar con">
          <button
            type="button"
            className={`${historyStyles.periodChip} ${!compareManual ? historyStyles.periodChipActive : ''}`}
            onClick={() => setCompareManual(false)}
          >
            Anterior
          </button>
          <button
            type="button"
            className={`${historyStyles.periodChip} ${compareManual ? historyStyles.periodChipActive : ''}`}
            onClick={() => {
              setCompareStart(autoCompare.start);
              setCompareEnd(autoCompare.end);
              setCompareManual(true);
            }}
          >
            Elegir periodo
          </button>
        </div>
        {compareManual ? (
          <div className={historyStyles.rangeRow}>
            <label className={historyStyles.dateField}>
              <span>Comparar desde</span>
              <input
                type="date"
                value={compareStart}
                onChange={(event) => setCompareStart(event.target.value)}
              />
            </label>
            <label className={historyStyles.dateField}>
              <span>Hasta</span>
              <input
                type="date"
                value={compareEnd}
                onChange={(event) => setCompareEnd(event.target.value)}
              />
            </label>
            <p className={styles.compareHint}>
              Debe durar {rangeDayCount(range.start, range.end)}{' '}
              {rangeDayCount(range.start, range.end) === 1 ? 'día' : 'días'}
            </p>
          </div>
        ) : null}

        <p className={historyStyles.summary}>
          {formatIsoDayRange(range.start, range.end)} · comparado con{' '}
          {formatIsoDayRange(compareRange.start, compareRange.end)} ·{' '}
          {statsGranularityLabel(statsGranularity(range.start, range.end))}
        </p>

        <details className={styles.excludeBox}>
          <summary>
            <span className={styles.excludeTitle}>Excluir pruebas</span>
            <span className={styles.excludeToggle}>
              <span className={styles.expandLabel}>Mostrar</span>
              <span className={styles.collapseLabel}>Ocultar</span>
              <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
            </span>
          </summary>
          <div className={styles.excludeGrid}>
            <div className={historyStyles.filterField}>
              <span id="stats-restaurant-label">Negocios</span>
              <EntityFilterCombobox
                id="stats-restaurant"
                labelledBy="stats-restaurant-label"
                options={restaurantOptions}
                selectedIds={exclusions.restaurantIds}
                mode="exclude"
                placeholder="Excluir un restaurante"
                onChange={({ ids }) => persistExclusions({ ...exclusions, restaurantIds: ids })}
              />
            </div>
            <div className={historyStyles.filterField}>
              <span id="stats-driver-label">Repartidores</span>
              <EntityFilterCombobox
                id="stats-driver"
                labelledBy="stats-driver-label"
                options={driverOptions}
                selectedIds={exclusions.driverIds}
                mode="exclude"
                placeholder="Excluir un repartidor"
                onChange={({ ids }) => persistExclusions({ ...exclusions, driverIds: ids })}
              />
            </div>
            <div className={historyStyles.filterField}>
              <span id="stats-phone-label">Teléfonos de clientes</span>
              <div className={styles.phoneRow}>
                <input
                  id="stats-phone"
                  aria-labelledby="stats-phone-label"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="55 1111 2222"
                  value={phoneDraft}
                  onChange={(event) => setPhoneDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addPhone();
                    }
                  }}
                />
                <button type="button" className={historyStyles.applyButton} onClick={addPhone}>
                  Excluir
                </button>
              </div>
              {exclusions.phones.length > 0 ? (
                <ul className={styles.chips}>
                  {exclusions.phones.map((phone) => (
                    <li key={phone} className={styles.chip}>
                      {phone}
                      <button
                        type="button"
                        aria-label={`Quitar ${phone}`}
                        onClick={() =>
                          persistExclusions({
                            ...exclusions,
                            phones: exclusions.phones.filter((item) => item !== phone),
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </details>
      </div>

      {loading && !stats ? (
        <div className={historyStyles.empty}>Cargando estadísticas…</div>
      ) : stats ? (
        <div className={dimmed ? styles.dimmed : undefined} aria-busy={dimmed}>
          <dl className={styles.kpis}>
            <div className={styles.kpi}>
              <dt>Pedidos cerrados</dt>
              <dd className={styles.kpiValue}>{summary?.order_count ?? 0}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.order_count_change_pct)}`}>
                {formatChangePct(summary?.order_count_change_pct)} vs periodo anterior
              </dd>
            </div>
            <div className={styles.kpi}>
              <dt>Entregados</dt>
              <dd className={styles.kpiValue}>{summary?.delivered_count ?? 0}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.delivered_count_change_pct)}`}>
                {formatChangePct(summary?.delivered_count_change_pct)} vs periodo anterior
              </dd>
            </div>
            <div className={styles.kpi}>
              <dt>Cancelados</dt>
              <dd className={styles.kpiValue}>{summary?.cancelled_count ?? 0}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.cancelled_count_change_pct)}`}>
                {formatChangePct(summary?.cancelled_count_change_pct)} vs periodo anterior
              </dd>
              <dd className={styles.kpiHint}>{summary?.cancellation_rate_pct ?? 0}% del periodo</dd>
            </div>
            <div className={styles.kpi}>
              <dt>Tarifas</dt>
              <dd className={styles.kpiValue}>{formatMoney(summary?.earnings_cents ?? 0)}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.earnings_change_pct)}`}>
                {formatChangePct(summary?.earnings_change_pct)} vs periodo anterior
              </dd>
            </div>
            <div className={styles.kpi}>
              <dt>Ocupación máx.</dt>
              <dd className={styles.kpiValue}>{summary?.peak_occupancy ?? 0}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.peak_occupancy_change_pct)}`}>
                {formatChangePct(summary?.peak_occupancy_change_pct)} vs el otro periodo
              </dd>
              <dd className={styles.kpiHint}>Repas ocupados a la vez</dd>
            </div>
            <div className={styles.kpi}>
              <dt>Enrutados</dt>
              <dd className={styles.kpiValue}>{summary?.routed_order_count ?? 0}</dd>
              <dd className={`${styles.kpiChange} ${changeClass(summary?.routed_order_change_pct)}`}>
                {formatChangePct(summary?.routed_order_change_pct)} vs el otro periodo
              </dd>
              <dd className={styles.kpiHint}>
                {summary?.stacked_rider_count ?? 0} repas con 2+ pedidos
              </dd>
            </div>
            <div className={styles.kpi}>
              <dt>Hora pico</dt>
              <dd className={styles.kpiValue}>{summary?.peak_hour ?? '—'}</dd>
              <dd className={styles.kpiHint}>{summary?.peak_hour_count ?? 0} solicitudes</dd>
            </div>
            <div className={styles.kpi}>
              <dt>Mexy</dt>
              <dd className={styles.kpiValue}>{formatMoney(summary?.mexy_fee_cents ?? 0)}</dd>
              <dd className={styles.kpiHint}>Solo entregados</dd>
            </div>
          </dl>

          {empty ? (
            <div className={historyStyles.empty}>
              <p className={historyStyles.emptyTitle}>No hay pedidos cerrados en este periodo.</p>
            </div>
          ) : (
            <>
              <div className={styles.charts}>
                <article className={`${styles.card} ${styles.wide}`}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Tendencia</h2>
                    <p className={styles.cardSubtitle}>
                      Pedidos cerrados · {statsGranularityLabel(stats.granularity).toLowerCase()}
                    </p>
                  </header>
                  <ul className={styles.legend}>
                    <li className={styles.legendItem}>
                      <span className={styles.swatch} aria-hidden />
                      Este periodo
                    </li>
                    <li className={styles.legendItem}>
                      <span className={`${styles.swatch} ${styles.swatchPrev}`} aria-hidden />
                      Periodo anterior
                    </li>
                  </ul>
                  <StatsTrendChart
                    data={statsTrendPoints(stats.series)}
                    currentName="Este periodo"
                    previousName="Periodo comparado"
                  />
                </article>

                <article className={`${styles.card} ${styles.wide}`}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Entregados vs cancelados</h2>
                    <p className={styles.cardSubtitle}>Cierres de este periodo</p>
                  </header>
                  <StatsStackedChart
                    data={stats.series.map((point) => ({
                      label: point.label,
                      delivered: point.current_delivered_count ?? 0,
                      cancelled: point.current_cancelled_count ?? 0,
                    }))}
                  />
                </article>

                <article className={`${styles.card} ${styles.wide}`}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Horas pico</h2>
                    <p className={styles.cardSubtitle}>
                      {stats.granularity === 'hourly'
                        ? 'Solicitudes por hora. Toca una barra para ver el rango.'
                        : 'Solicitudes por hora y día. Toca una celda para ver el rango.'}
                    </p>
                  </header>
                  <StatsPeakHours
                    cells={stats.hour_heatmap ?? []}
                    singleDay={stats.granularity === 'hourly'}
                  />
                </article>

                <article className={`${styles.card} ${styles.wide}`}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Ocupación de repas</h2>
                    <p className={styles.cardSubtitle}>Máximo de repas ocupados a la vez</p>
                  </header>
                  <StatsTrendChart
                    data={stats.series.map((point) => ({
                      label: point.label,
                      current: point.current_occupancy ?? 0,
                      previous: point.previous_occupancy ?? 0,
                    }))}
                    currentName="Este periodo"
                    previousName="Periodo comparado"
                  />
                </article>

                <article className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Fuente</h2>
                    <p className={styles.cardSubtitle}>App web vs pedido manual</p>
                  </header>
                  <StatsSourceDonut segments={statsSourceSegments(stats.sources)} />
                </article>

                <article className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Top negocios</h2>
                    <p className={styles.cardSubtitle}>Entregas en el periodo</p>
                  </header>
                  <StatsRankChart
                    data={statsRankPoints(stats.top_restaurants).map((row) => ({
                      ...row,
                      detail: formatMoney(row.earningsCents),
                    }))}
                    formatValue={(value) => String(value)}
                  />
                </article>

                <article className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Top repas</h2>
                    <p className={styles.cardSubtitle}>Entregas en el periodo</p>
                  </header>
                  <StatsRankChart
                    data={statsRankPoints(stats.top_drivers).map((row) => ({
                      ...row,
                      detail: formatMoney(row.earningsCents),
                    }))}
                    formatValue={(value) => String(value)}
                  />
                </article>
              </div>

              <section className={styles.card}>
                <div className={styles.recentHeader}>
                  <header className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Últimos pedidos</h2>
                    <p className={styles.cardSubtitle}>Hasta 12 cierres de este periodo</p>
                  </header>
                  <Link className={styles.historyLink} href="/historial">
                    Ver historial
                  </Link>
                </div>
                {stats.recent.length === 0 ? (
                  <p className={historyStyles.emptyHint}>No hay pedidos cerrados en este periodo.</p>
                ) : (
                  <ul className={styles.recentList}>
                    {stats.recent.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={historyStyles.card}
                          onClick={() => setSelected(item)}
                        >
                          <div className={historyStyles.cardTop}>
                            <strong>{formatShortId(item.short_id) || 'Pedido'}</strong>
                            <span
                              className={`${historyStyles.status} ${
                                item.status === 'delivered'
                                  ? historyStyles.statusOk
                                  : historyStyles.statusMuted
                              }`}
                            >
                              {requestStatusLabel(item.status)}
                            </span>
                          </div>
                          <p className={historyStyles.cardTitle}>{item.restaurant_name}</p>
                          <p className={historyStyles.cardMeta}>
                            {formatDateTime(item.closed_at)} · {item.assigned_driver_name || 'Sin repartidor'}
                          </p>
                          <p className={historyStyles.cardMeta}>
                            tarifa {formatMoney(item.quoted_fee_cents)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
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
