'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { AssignDriverDrawer } from '@/components/monitor/AssignDriverDrawer';
import { DispatchMonitorMap } from '@/components/monitor/DispatchMonitorMap';
import { RequestDetailDrawer } from '@/components/monitor/RequestDetailDrawer';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { DriverAvatar } from '@/components/drivers/DriverAvatar';
import { DriverMetaTags } from '@/components/drivers/DriverMetaTags';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import {
  createMyManualDispatchOffer,
  getMyDispatchMonitor,
  retryMyUnassignedDispatchRequest,
  updateDriverItinerary,
} from '@/lib/api/deliveryProviders';
import type {
  DispatchMonitorCreditHold,
  DispatchMonitorDriver,
  DispatchMonitorOffer,
  DispatchMonitorRequest,
  DispatchMonitorSnapshot,
} from '@/lib/api/types';
import {
  blockersSummary,
  demandReasonLine,
  formatCountdown,
  formatSearchStartedAt,
  formatShortId,
  formatTime,
  gpsAgeLabel,
  offerCaseLine,
  requestCashDenominationLine,
  requestLastAssignmentLine,
  requestMoneyLine,
  requestPackageLine,
  requestSchedulerLine,
  requestStatusLabel,
} from '@/lib/dispatch/monitorCopy';
import {
  useDispatchMonitorSocket,
  type DispatchMonitorSocketStatus,
} from '@/lib/dispatch/useDispatchMonitorSocket';
import { liveBusinessesFromRequests, type MonitorLiveBusiness } from '@/lib/dispatch/liveBusinesses';
import { formatMoney } from '@/lib/pricing/tariffUtils';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import { zoneColorForId } from '@/lib/dispatch/zoneColors';
import panelStyles from './PartnershipsPage.module.css';
import styles from './MonitorPage.module.css';

function connectionLabel(status: DispatchMonitorSocketStatus): string {
  if (status === 'live') return 'En vivo';
  if (status === 'connecting') return 'Conectando…';
  if (status === 'reconnecting') return 'Reconectando…';
  return 'Sin conexión';
}

function ZoneSwatch({ zoneId, zoneIds }: { zoneId?: string | null; zoneIds: string[] }) {
  const color = zoneColorForId(zoneId, zoneIds);
  return (
    <span
      className={styles.zoneSwatch}
      style={{ background: color.solid }}
      aria-hidden
    />
  );
}

function MetricCard({
  label,
  value,
  tone,
  hint,
  onClick,
  pressed,
}: {
  label: string;
  value: string | number;
  tone?: string;
  hint?: string | null;
  onClick?: () => void;
  pressed?: boolean;
}) {
  const className = [
    styles.metricCard,
    tone ? styles[tone] : '',
    onClick ? styles.metricCardClickable : '',
    pressed ? styles.metricCardPressed : '',
  ]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={pressed}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

type DriverFilter = 'all' | 'online' | 'stale' | 'offline';

function isStaleGps(driver: DispatchMonitorDriver): boolean {
  return driver.is_online && driver.location_stale;
}

function gpsAgeClass(driver: DispatchMonitorDriver): string {
  if (driver.last_lat == null || driver.last_lng == null || driver.location_age_seconds == null) {
    return styles.gpsMissing;
  }
  if (isStaleGps(driver) || driver.location_age_seconds >= 60) {
    return styles.gpsStale;
  }
  return styles.gpsFresh;
}

function driverMatchesFilter(driver: DispatchMonitorDriver, filter: DriverFilter): boolean {
  if (filter === 'online') return driver.is_online;
  if (filter === 'offline') return !driver.is_online;
  if (filter === 'stale') return isStaleGps(driver);
  return true;
}

type TimeSort = 'desc' | 'asc';

function timeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTime(
  left: string | null | undefined,
  right: string | null | undefined,
  dir: TimeSort,
): number {
  const delta = timeMs(left) - timeMs(right);
  return dir === 'desc' ? -delta : delta;
}

function requestRecency(request: DispatchMonitorRequest): string | undefined {
  return request.created_at ?? request.search_at;
}

function MonitorPanel({
  id,
  title,
  count,
  collapsed,
  onToggle,
  sortDir,
  onToggleSort,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  sortDir?: TimeSort;
  onToggleSort?: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.panel}>
      <div className={styles.panelHeader}>
        <button
          type="button"
          className={styles.panelToggle}
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <ExpandMoreOutlinedIcon
            className={collapsed ? styles.panelChevronCollapsed : styles.panelChevron}
            fontSize="small"
            aria-hidden
          />
          <h2 className={styles.panelTitle}>{title}</h2>
          {count != null ? <span className={styles.panelCount}>{count}</span> : null}
        </button>
        {onToggleSort && sortDir ? (
          <button
            type="button"
            className={styles.sortBtn}
            onClick={onToggleSort}
            aria-label={
              sortDir === 'desc'
                ? `${title}: más recientes primero; clic para más antiguos`
                : `${title}: más antiguos primero; clic para más recientes`
            }
          >
            <span className={styles.sortDir} aria-hidden>
              <span className={sortDir === 'asc' ? styles.sortDirActive : styles.sortDirIdle}>
                <ArrowUpwardOutlinedIcon className={styles.sortArrow} fontSize="inherit" />
              </span>
              <span className={sortDir === 'desc' ? styles.sortDirActive : styles.sortDirIdle}>
                <ArrowDownwardOutlinedIcon className={styles.sortArrow} fontSize="inherit" />
              </span>
            </span>
          </button>
        ) : null}
      </div>
      {collapsed ? null : children}
    </section>
  );
}

function QueueList({
  requests,
  canAssign,
  onAssign,
  onDetail,
  onFocus,
  focusedRequestId,
  nowMs,
  emptyHint = 'Sin pedidos en cola.',
  colorByZone = false,
  zoneIds = [],
}: {
  requests: DispatchMonitorRequest[];
  canAssign: boolean;
  onAssign: (request: DispatchMonitorRequest) => void;
  onDetail: (request: DispatchMonitorRequest) => void;
  onFocus: (request: DispatchMonitorRequest) => void;
  focusedRequestId: string | null;
  nowMs: number;
  emptyHint?: string;
  colorByZone?: boolean;
  zoneIds?: string[];
}) {
  if (requests.length === 0) {
    return <p className={styles.emptyHint}>{emptyHint}</p>;
  }
  return (
    <ul className={styles.list}>
      {requests.map((request) => {
        const scheduler = requestSchedulerLine(request, nowMs);
        const blockers = blockersSummary(request.search_blockers);
        const searchingStuck =
          ['searching', 'unassigned', 'offered'].includes(request.status) &&
          (request.eligible_driver_count ?? 0) === 0;
        const focused = focusedRequestId === request.id;
        const lastLine = requestLastAssignmentLine(request);
        const cashDenom = requestCashDenominationLine(request);
        return (
          <li
            key={request.id}
            className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
          >
            <button
              type="button"
              className={styles.queueCardButton}
              onClick={() => onFocus(request)}
              aria-pressed={focused}
            >
              <span className={styles.listTitle}>
                <span className={styles.shortId}>{formatShortId(request.short_id)}</span>
                {request.customer_name}
              </span>
              <span className={styles.listMeta}>
                {request.restaurant_name}
                {colorByZone && request.zone_name ? (
                  <>
                    {' · '}
                    <ZoneSwatch zoneId={request.zone_id} zoneIds={zoneIds} />
                    {request.zone_name}
                  </>
                ) : null}
              </span>
              <span className={styles.listAddress}>{request.dropoff_address}</span>
              <span className={styles.queueMeta}>
                <span className={styles.queueTag} title="Inicio de búsqueda de repartidor">
                  {formatSearchStartedAt(request.search_at)}
                </span>
                <span className={styles.queueTag}>{requestPackageLine(request)}</span>
                {cashDenom ? <span className={styles.queueTagCash}>{cashDenom}</span> : null}
                <span className={styles.queueTag}>{requestMoneyLine(request)}</span>
              </span>
              {scheduler ? <span className={styles.listSchedule}>{scheduler}</span> : null}
              {lastLine ? <span className={styles.queueLast}>{lastLine}</span> : null}
              {searchingStuck && blockers ? (
                <span className={styles.listBlockers}>0 candidatos · {blockers}</span>
              ) : null}
            </button>
            <div className={styles.queueCardSide}>
              <span className={styles.statusChip}>{requestStatusLabel(request.status)}</span>
              {request.is_due_search ? <span className={styles.dueChip}>Listo</span> : null}
              <button
                type="button"
                className={styles.detailButton}
                onClick={() => onDetail(request)}
                aria-label={`Ver detalle de ${formatShortId(request.short_id)}`}
              >
                Detalle
              </button>
              {canAssign ? (
                <button type="button" className={styles.assignButton} onClick={() => onAssign(request)}>
                  Asignar
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function assignedRiderPlate(
  request: DispatchMonitorRequest,
  driversById: Map<string, DispatchMonitorDriver>,
): string | null {
  const fromRequest = request.assigned_driver_plate?.trim();
  if (fromRequest) return fromRequest;
  if (!request.assigned_driver_id) return null;
  return driversById.get(request.assigned_driver_id)?.plate?.trim() || null;
}

function ActiveList({
  requests,
  driversById,
  canAssign,
  onAssign,
  onDetail,
  onFocus,
  focusedRequestId,
  nowMs,
  colorByZone = false,
  zoneIds = [],
}: {
  requests: DispatchMonitorRequest[];
  driversById: Map<string, DispatchMonitorDriver>;
  canAssign: boolean;
  onAssign: (request: DispatchMonitorRequest) => void;
  onDetail: (request: DispatchMonitorRequest) => void;
  onFocus: (request: DispatchMonitorRequest) => void;
  focusedRequestId: string | null;
  nowMs: number;
  colorByZone?: boolean;
  zoneIds?: string[];
}) {
  if (requests.length === 0) {
    return <p className={styles.emptyHint}>Sin entregas en curso.</p>;
  }
  return (
    <ul className={styles.list}>
      {requests.map((request) => {
        const scheduler = requestSchedulerLine(request, nowMs);
        const focused = focusedRequestId === request.id;
        const plate = assignedRiderPlate(request, driversById);
        return (
          <li
            key={request.id}
            className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
          >
            <button
              type="button"
              className={styles.queueCardButton}
              onClick={() => onFocus(request)}
              aria-pressed={focused}
            >
              <span className={styles.listTitle}>
                <span className={styles.shortId}>{formatShortId(request.short_id)}</span>
                {request.customer_name}
              </span>
              <span className={styles.listMeta}>
                {request.assigned_driver_name ? (
                  <>
                    <span className={styles.assignedRiderName}>{request.assigned_driver_name}</span>
                    {plate ? (
                      <span className={styles.assignedRiderPlate}>{plate}</span>
                    ) : null}
                    {' · '}
                  </>
                ) : (
                  'Sin repartidor · '
                )}
                {request.restaurant_name}
                {colorByZone && request.zone_name ? (
                  <>
                    {' · '}
                    <ZoneSwatch zoneId={request.zone_id} zoneIds={zoneIds} />
                    {request.zone_name}
                  </>
                ) : null}
              </span>
              <span className={styles.listAddress}>{request.dropoff_address}</span>
              <span className={styles.listMeta}>
                {requestMoneyLine(request)} · {requestPackageLine(request)}
              </span>
              {scheduler ? <span className={styles.listSchedule}>{scheduler}</span> : null}
              {request.notes ? <span className={styles.listMeta}>{request.notes}</span> : null}
            </button>
            <div className={styles.queueCardSide}>
              <span className={styles.statusChip}>{requestStatusLabel(request.status)}</span>
              <button
                type="button"
                className={styles.detailButton}
                onClick={() => onDetail(request)}
                aria-label={`Ver detalle de ${formatShortId(request.short_id)}`}
              >
                Detalle
              </button>
              {canAssign ? (
                <button type="button" className={styles.assignButton} onClick={() => onAssign(request)}>
                  Asignar
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OffersList({ offers, nowMs }: { offers: DispatchMonitorOffer[]; nowMs: number }) {
  if (offers.length === 0) {
    return <p className={styles.emptyHint}>Sin ofertas abiertas.</p>;
  }
  return (
    <ul className={styles.list}>
      {offers.map((offer) => {
        const remaining = formatCountdown(offer.expires_at, nowMs);
        return (
          <li key={offer.id} className={styles.listItem}>
            <div className={styles.listMain}>
              <div className={styles.listContent}>
                <span className={styles.listTitle}>{offer.driver_name}</span>
                <span className={styles.listMeta}>
                  {formatShortId(offer.short_id)} · {offer.customer_name} · {offer.restaurant_name}
                </span>
                {offer.dropoff_address ? (
                  <span className={styles.listAddress}>{offer.dropoff_address}</span>
                ) : null}
                <span className={styles.listSchedule}>{offerCaseLine(offer)}</span>
              </div>
            </div>
            <div className={styles.listAside}>
              <span className={remaining === 'ahora' ? styles.alertChip : styles.dueChip}>
                {remaining === 'ahora' ? 'Expiró' : `Expira ${remaining}`}
              </span>
              <span className={styles.listMeta}>{formatTime(offer.expires_at)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CreditList({ holds }: { holds: DispatchMonitorCreditHold[] }) {
  if (holds.length === 0) {
    return <p className={styles.emptyHint}>Sin crédito retenido.</p>;
  }
  return (
    <ul className={styles.list}>
      {holds.map((hold) => (
        <li key={hold.id} className={styles.listItem}>
          <div className={styles.listMain}>
            <span className={styles.listTitle}>{hold.driver_name}</span>
            <span className={styles.listMeta}>
              {formatShortId(hold.short_id)} · {hold.customer_name} · {hold.restaurant_name}
            </span>
          </div>
          <span className={styles.creditChip}>{formatMoney(hold.amount_cents)}</span>
        </li>
      ))}
    </ul>
  );
}

function DriversList({
  drivers,
  maxPackages,
  filter,
  onFilterChange,
  focusedDriverId,
  onFocus,
  colorByZone = false,
  zoneIds = [],
}: {
  drivers: DispatchMonitorDriver[];
  maxPackages: number;
  filter: DriverFilter;
  onFilterChange: (filter: DriverFilter) => void;
  focusedDriverId: string | null;
  onFocus: (driver: DispatchMonitorDriver) => void;
  colorByZone?: boolean;
  zoneIds?: string[];
}) {
  const counts = {
    all: drivers.length,
    online: drivers.filter((driver) => driver.is_online).length,
    stale: drivers.filter(isStaleGps).length,
    offline: drivers.filter((driver) => !driver.is_online).length,
  };
  const filtered = drivers.filter((driver) => driverMatchesFilter(driver, filter));
  const sorted = [...filtered].sort((a, b) => {
    if (filter === 'stale') {
      return (b.location_age_seconds ?? 0) - (a.location_age_seconds ?? 0);
    }
    return Number(b.is_online) - Number(a.is_online);
  });

  const filters: { id: DriverFilter; label: string; count: number; warn?: boolean }[] = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'online', label: 'En línea', count: counts.online },
    { id: 'stale', label: 'GPS viejo', count: counts.stale, warn: true },
    { id: 'offline', label: 'Offline', count: counts.offline },
  ];

  const emptyHint =
    filter === 'stale'
      ? 'Nadie con GPS viejo.'
      : filter === 'online'
        ? 'Nadie en línea.'
        : filter === 'offline'
          ? 'Nadie offline.'
          : 'Sin repartidores.';

  return (
    <>
      <div className={styles.filterRow} role="toolbar" aria-label="Filtrar repartidores">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterChip}${active ? ` ${styles.filterChipActive}` : ''}${
                item.warn ? ` ${styles.filterChipWarn}` : ''
              }`}
              aria-pressed={active}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
              <span className={styles.filterCount}>{item.count}</span>
            </button>
          );
        })}
      </div>
      {sorted.length === 0 ? (
        <p className={styles.emptyHint}>{emptyHint}</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((driver) => {
            const occupation = driver.is_pre_free
              ? `Pre-libre ${driver.pre_free_eta_seconds ?? 0}s`
              : driver.active_request_status === 'in_transit'
                ? 'En camino'
                : driver.active_request_status === 'picked_up'
                  ? 'Recogido'
                  : driver.active_request_status === 'assigned'
                    ? 'Va al negocio'
                    : driver.open_offer_id
                      ? 'Oferta abierta'
                      : driver.status === 'invited'
                        ? 'Invitado'
                        : 'Libre';
            const packages = `${driver.active_package_count ?? 0}/${maxPackages} pq`;
            const credit = `${formatMoney(driver.credit_held_cents)} / ${formatMoney(driver.credit_limit_cents)}`;
            const focused = focusedDriverId === driver.id;
            const hasLocation = driver.last_lat != null && driver.last_lng != null;
            return (
              <li
                key={driver.id}
                className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
              >
                <button
                  type="button"
                  className={styles.queueCardButton}
                  onClick={() => onFocus(driver)}
                  aria-pressed={focused}
                  aria-label={
                    hasLocation
                      ? `Ver ubicación de ${driver.first_name} ${driver.last_name}`
                      : `${driver.first_name} ${driver.last_name} sin ubicación GPS`
                  }
                >
                  <div className={styles.listMain}>
                    <DriverAvatar
                      firstName={driver.first_name}
                      lastName={driver.last_name}
                      profilePhotoPath={driver.profile_photo_path}
                      size="sm"
                    />
                    <div className={styles.listContent}>
                      <span className={styles.listTitle}>
                        {driver.first_name} {driver.last_name}
                      </span>
                      <DriverMetaTags
                        plate={driver.plate}
                        motorcycleColor={driver.motorcycle_color}
                        compartmentSize={driver.compartment_size}
                        creditAvailableCents={driver.credit_available_cents}
                      />
                      <span className={styles.listMeta}>
                        {occupation} · {packages} · crédito {credit}
                      </span>
                      {colorByZone && driver.registered_zone_name ? (
                        <span className={styles.listMeta}>
                          <ZoneSwatch
                            zoneId={driver.registered_zone_id}
                            zoneIds={zoneIds}
                          />
                          {driver.registered_zone_name}
                        </span>
                      ) : null}
                      <span className={`${styles.gpsChip} ${gpsAgeClass(driver)}`}>
                        {gpsAgeLabel(driver.location_age_seconds)}
                      </span>
                    </div>
                  </div>
                </button>
                <div className={styles.queueCardSide}>
                  <div className={styles.listAsideChips}>
                    <span
                      className={`${styles.statusChip} ${driver.is_online ? styles.chipOnline : styles.chipOffline}`}
                    >
                      {driver.is_online ? 'En línea' : 'Offline'}
                    </span>
                    {driver.status === 'invited' ? <span className={styles.warnChip}>Invitado</span> : null}
                    {driver.open_offer_id ? <span className={styles.dueChip}>Oferta</span> : null}
                    {driver.is_pre_free ? <span className={styles.chipOnline}>Pre-libre</span> : null}
                    {driver.credit_blocked ? <span className={styles.alertChip}>Sin crédito</span> : null}
                    {isStaleGps(driver) ? <span className={styles.warnChip}>GPS viejo</span> : null}
                  </div>
                  <DriverPhoneContact
                    phone={driver.phone}
                    compact
                    iconsOnly
                    stopPropagation
                    className={styles.asidePhone}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function BusinessLogo({ name, logoPath }: { name: string; logoPath: string | null }) {
  const url = storagePublicUrl(logoPath);
  if (url) {
    return <img src={url} alt="" className={styles.businessLogo} />;
  }
  return (
    <span className={styles.businessLogoFallback} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || (
        <StorefrontOutlinedIcon sx={{ fontSize: 16 }} />
      )}
    </span>
  );
}

function BusinessesList({
  businesses,
  focusedRestaurantId,
  onFocus,
  colorByZone = false,
  zoneIds = [],
}: {
  businesses: MonitorLiveBusiness[];
  focusedRestaurantId: string | null;
  onFocus: (business: MonitorLiveBusiness) => void;
  colorByZone?: boolean;
  zoneIds?: string[];
}) {
  if (businesses.length === 0) {
    return <p className={styles.emptyHint}>Ningún negocio con pedidos en este momento.</p>;
  }
  return (
    <ul className={styles.list}>
      {businesses.map((business) => {
        const focused = focusedRestaurantId === business.id;
        return (
          <li
            key={business.id}
            className={`${styles.queueCard}${focused ? ` ${styles.queueCardFocused}` : ''}`}
          >
            <button
              type="button"
              className={styles.queueCardButton}
              onClick={() => onFocus(business)}
              aria-pressed={focused}
              aria-label={`Ver pedidos de ${business.name}`}
            >
              <div className={styles.listMain}>
                <BusinessLogo name={business.name} logoPath={business.logoPath} />
                <div className={styles.listContent}>
                  <span className={styles.listTitle}>{business.name}</span>
                  {business.address ? (
                    <span className={styles.listAddress}>{business.address}</span>
                  ) : null}
                  <span className={styles.queueMeta} aria-label="Pedidos del negocio">
                    {business.queueCount > 0 ? (
                      <span className={`${styles.queueTag} ${styles.statQueue}`}>
                        {business.queueCount} en cola
                      </span>
                    ) : null}
                    {business.activeCount > 0 ? (
                      <span className={`${styles.queueTag} ${styles.statActive}`}>
                        {business.activeCount} en curso
                      </span>
                    ) : null}
                    {business.unassignedCount > 0 ? (
                      <span className={`${styles.queueTag} ${styles.statUnassigned}`}>
                        {business.unassignedCount} sin asignar
                      </span>
                    ) : null}
                  </span>
                  {colorByZone && business.zoneName ? (
                    <span className={styles.listMeta}>
                      <ZoneSwatch zoneId={business.zoneId} zoneIds={zoneIds} />
                      {business.zoneName}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
            <div className={styles.queueCardSide}>
              <DriverPhoneContact
                phone={business.phone}
                compact
                iconsOnly
                stopPropagation
                className={styles.asidePhone}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function MonitorPage() {
  const { accessToken } = useAuth();
  const { canManagePartnerships } = useDeliveryProviderAccess();
  const { selectedZoneId, zones, isAllZones, loading: zonesLoading } = useDeliveryZone();
  const zoneIds = useMemo(() => zones.map((zone) => zone.id), [zones]);
  const [snapshot, setSnapshot] = useState<DispatchMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<DispatchMonitorSocketStatus>('offline');
  const [assigningRequest, setAssigningRequest] = useState<DispatchMonitorRequest | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignBusyKind, setAssignBusyKind] = useState<'system' | 'manual' | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [focusedRequestId, setFocusedRequestId] = useState<string | null>(null);
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  const [focusedRestaurantId, setFocusedRestaurantId] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<DriverFilter>('all');
  const [timeSort, setTimeSort] = useState<Record<string, TimeSort>>({
    queue: 'desc',
    unassigned: 'desc',
    active: 'desc',
    offers: 'desc',
    credit: 'desc',
  });
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [logNonce, setLogNonce] = useState(0);
  const snapshotInFlightRef = useRef(false);
  const snapshotQueuedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!accessToken || zonesLoading) return;
    if (snapshotInFlightRef.current) {
      snapshotQueuedRef.current = true;
      return;
    }
    snapshotInFlightRef.current = true;
    setError(null);
    try {
      do {
        snapshotQueuedRef.current = false;
        const data = await getMyDispatchMonitor(
          accessToken,
          isAllZones ? null : selectedZoneId,
        );
        setSnapshot(data);
      } while (snapshotQueuedRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el monitor');
    } finally {
      snapshotInFlightRef.current = false;
      setLoading(false);
    }
  }, [accessToken, isAllZones, selectedZoneId, zonesLoading]);

  useEffect(() => {
    setLoading(true);
    void loadSnapshot();
  }, [loadSnapshot]);

  useDispatchMonitorSocket(accessToken, {
    onEvent: () => {
      void loadSnapshot();
      setLogNonce((value) => value + 1);
    },
    onStatusChange: setConnectionStatus,
    onReconnect: () => {
      void loadSnapshot();
      setLogNonce((value) => value + 1);
    },
  });

  // Fallback poll only when the websocket is not live — avoids stacking DB load.
  useEffect(() => {
    if (!accessToken || connectionStatus === 'live') return;
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [accessToken, connectionStatus, loadSnapshot]);

  const queueRequests = useMemo(
    () =>
      (snapshot?.requests ?? []).filter((row) =>
        ['scheduled', 'searching', 'offered'].includes(row.status),
      ),
    [snapshot],
  );

  const activeRequests = useMemo(
    () =>
      (snapshot?.requests ?? []).filter((row) =>
        ['assigned', 'picked_up', 'in_transit'].includes(row.status),
      ),
    [snapshot],
  );

  const unassignedRequests = useMemo(
    () => (snapshot?.requests ?? []).filter((row) => row.status === 'unassigned'),
    [snapshot],
  );

  const businesses = useMemo(
    () => liveBusinessesFromRequests(snapshot?.requests ?? []),
    [snapshot],
  );

  const sortedQueue = useMemo(
    () =>
      [...queueRequests].sort((a, b) =>
        compareTime(requestRecency(a), requestRecency(b), timeSort.queue),
      ),
    [queueRequests, timeSort.queue],
  );
  const sortedUnassigned = useMemo(
    () =>
      [...unassignedRequests].sort((a, b) =>
        compareTime(requestRecency(a), requestRecency(b), timeSort.unassigned),
      ),
    [timeSort.unassigned, unassignedRequests],
  );
  const sortedActive = useMemo(
    () =>
      [...activeRequests].sort((a, b) =>
        compareTime(requestRecency(a), requestRecency(b), timeSort.active),
      ),
    [activeRequests, timeSort.active],
  );
  const driversById = useMemo(() => {
    const map = new Map<string, DispatchMonitorDriver>();
    for (const driver of snapshot?.drivers ?? []) {
      map.set(driver.id, driver);
    }
    return map;
  }, [snapshot?.drivers]);
  const sortedOffers = useMemo(
    () =>
      [...(snapshot?.offers ?? [])].sort((a, b) =>
        compareTime(a.expires_at, b.expires_at, timeSort.offers),
      ),
    [snapshot?.offers, timeSort.offers],
  );
  const sortedCredit = useMemo(() => {
    const recency = new Map(
      (snapshot?.requests ?? []).map((row) => [row.id, requestRecency(row)]),
    );
    return [...(snapshot?.credit_holds ?? [])].sort((a, b) =>
      compareTime(recency.get(a.request_id), recency.get(b.request_id), timeSort.credit),
    );
  }, [snapshot?.credit_holds, snapshot?.requests, timeSort.credit]);

  function togglePanel(id: string) {
    setCollapsedPanels((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleSort(id: string) {
    setTimeSort((current) => ({
      ...current,
      [id]: current[id] === 'desc' ? 'asc' : 'desc',
    }));
  }

  const detailRequest = useMemo(
    () => (snapshot?.requests ?? []).find((row) => row.id === detailRequestId) ?? null,
    [detailRequestId, snapshot],
  );

  useEffect(() => {
    if (!detailRequestId) return;
    const stillVisible = (snapshot?.requests ?? []).some((row) => row.id === detailRequestId);
    if (!stillVisible) setDetailRequestId(null);
  }, [detailRequestId, snapshot]);

  useEffect(() => {
    if (!focusedRequestId) return;
    const stillVisible = (snapshot?.requests ?? []).some((row) => row.id === focusedRequestId);
    if (!stillVisible) setFocusedRequestId(null);
  }, [focusedRequestId, snapshot]);

  useEffect(() => {
    if (!focusedDriverId) return;
    const stillVisible = (snapshot?.drivers ?? []).some((row) => row.id === focusedDriverId);
    if (!stillVisible) setFocusedDriverId(null);
  }, [focusedDriverId, snapshot]);

  useEffect(() => {
    if (!focusedRestaurantId) return;
    const stillVisible = businesses.some((row) => row.id === focusedRestaurantId);
    if (!stillVisible) setFocusedRestaurantId(null);
  }, [businesses, focusedRestaurantId]);

  function handleFocusRequest(request: DispatchMonitorRequest) {
    setFocusedDriverId(null);
    setFocusedRestaurantId(null);
    setFocusedRequestId((current) => (current === request.id ? null : request.id));
  }

  function handleFocusDriver(driver: DispatchMonitorDriver) {
    setFocusedRequestId(null);
    setFocusedRestaurantId(null);
    setFocusedDriverId((current) => (current === driver.id ? null : driver.id));
  }

  function handleFocusBusiness(business: MonitorLiveBusiness) {
    setFocusedRequestId(null);
    setFocusedDriverId(null);
    setFocusedRestaurantId((current) => (current === business.id ? null : business.id));
  }

  function handleOpenDetail(request: DispatchMonitorRequest) {
    setAssigningRequest(null);
    setAssignError(null);
    setAssignBusyKind(null);
    setDetailRequestId(request.id);
  }

  function handleOpenAssign(request: DispatchMonitorRequest) {
    setDetailRequestId(null);
    setAssignError(null);
    setAssignBusyKind(null);
    setAssigningRequest(request);
  }

  function handleDriverFilter(next: DriverFilter) {
    setDriverFilter((current) => (current === next && next !== 'all' ? 'all' : next));
    document.getElementById('monitor-drivers')?.scrollIntoView({ block: 'nearest' });
  }

  const metrics = snapshot?.metrics;

  async function handleManualOffer(
    driverId: string,
    itinerary?: Array<{ kind: 'restaurant' | 'dropoff'; request_id: string }>,
  ) {
    if (!accessToken || !assigningRequest) return;
    setAssigning(true);
    setAssignBusyKind('manual');
    setAssignError(null);
    try {
      await createMyManualDispatchOffer(accessToken, assigningRequest.id, driverId, itinerary);
      setAssigningRequest(null);
      await loadSnapshot();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'No se pudo enviar la oferta');
    } finally {
      setAssigning(false);
      setAssignBusyKind(null);
    }
  }

  async function handleSystemRetry() {
    if (!accessToken || !assigningRequest || assigningRequest.status !== 'unassigned') return;
    setAssigning(true);
    setAssignBusyKind('system');
    setAssignError(null);
    try {
      await retryMyUnassignedDispatchRequest(accessToken, assigningRequest.id);
      setAssigningRequest(null);
      await loadSnapshot();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'No se pudo volver a buscar');
    } finally {
      setAssigning(false);
      setAssignBusyKind(null);
    }
  }

  async function handleReorderItinerary(
    driverId: string,
    stops: Array<{ kind: 'restaurant' | 'dropoff'; request_id: string }>,
  ) {
    if (!accessToken) return;
    try {
      await updateDriverItinerary(accessToken, driverId, stops);
      await loadSnapshot();
    } catch {
      await loadSnapshot();
    }
  }

  return (
    <PanelPageShell
      title="Monitor"
      subtitle="Observabilidad en tiempo real de pedidos, repartidores y demanda de tu operación."
      styles={panelStyles as PanelPageStyles}
      action={
        <div className={styles.liveBadge} data-status={connectionStatus}>
          <span className={styles.liveDot} aria-hidden />
          {connectionLabel(connectionStatus)}
          {snapshot ? (
            <span className={styles.updatedAt}>
              · {formatTime(snapshot.generated_at)}
            </span>
          ) : null}
        </div>
      }
    >
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {metrics?.tasks_backend === 'stub' ? (
        <div className={styles.stubNotice} role="status">
          Scheduler en modo local (stub): las búsquedas, expiraciones y reintentos no se disparan
          solos. Usa Asignar o el endpoint interno de tasks.
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className={styles.loading}>Cargando monitor…</div>
      ) : (
        <>
          <section className={styles.metricsRow} aria-label="Indicadores">
            <MetricCard
              label="En línea"
              value={metrics?.drivers_online ?? 0}
              tone="toneOnline"
              pressed={driverFilter === 'online'}
              onClick={() => handleDriverFilter('online')}
            />
            <MetricCard
              label="Offline"
              value={metrics?.drivers_offline ?? 0}
              pressed={driverFilter === 'offline'}
              onClick={() => handleDriverFilter('offline')}
            />
            <MetricCard
              label="GPS viejo"
              value={metrics?.drivers_location_stale ?? 0}
              tone={(metrics?.drivers_location_stale ?? 0) > 0 || driverFilter === 'stale' ? 'toneDue' : undefined}
              pressed={driverFilter === 'stale'}
              onClick={() => handleDriverFilter('stale')}
            />
            <MetricCard label="Cola" value={metrics?.requests_pending ?? 0} />
            <MetricCard label="Listos" value={metrics?.requests_due_search ?? 0} tone="toneDue" />
            <MetricCard label="En curso" value={metrics?.requests_in_progress ?? 0} />
            <MetricCard label="Ofertas" value={metrics?.offers_open ?? 0} />
            <MetricCard
              label="Sin asignar"
              value={metrics?.requests_unassigned ?? unassignedRequests.length}
              tone={(metrics?.requests_unassigned ?? 0) > 0 ? 'toneDue' : undefined}
            />
            <MetricCard
              label="Crédito retenido"
              value={metrics?.credit_holds_active ?? 0}
            />
            <MetricCard
              label="Sin crédito"
              value={metrics?.drivers_credit_blocked ?? 0}
              tone={(metrics?.drivers_credit_blocked ?? 0) > 0 ? 'toneDue' : undefined}
            />
            {metrics?.high_demand ? (
              <MetricCard
                label="Demanda"
                value="Alta"
                tone="toneDemand"
                hint={demandReasonLine(metrics)}
              />
            ) : (
              <MetricCard label="Demanda" value="Normal" />
            )}
          </section>

          <div className={styles.layout}>
            <section className={styles.mapSection} aria-label="Mapa en vivo">
              <DispatchMonitorMap
                snapshot={snapshot}
                zones={zones}
                selectedZoneId={selectedZoneId}
                focusedRequestId={focusedRequestId}
                focusedDriverId={focusedDriverId}
                focusedRestaurantId={focusedRestaurantId}
                onReorderItinerary={handleReorderItinerary}
              />
              <div className={styles.mapLegend} role="list" aria-label="Leyenda del mapa">
                {isAllZones
                  ? zones.map((zone) => (
                      <span key={zone.id} role="listitem">
                        <span
                          className={styles.legendZone}
                          style={{
                            background: zoneColorForId(zone.id, zoneIds).fill,
                            borderColor: zoneColorForId(zone.id, zoneIds).stroke,
                          }}
                          aria-hidden
                        />
                        {zone.name}
                      </span>
                    ))
                  : (
                      <span role="listitem">
                        <span className={styles.legendZone} aria-hidden /> Zona de cobertura
                      </span>
                    )}
                <span role="listitem">
                  <span className={styles.legendDriver} aria-hidden /> Repartidor
                </span>
                <span role="listitem">
                  <span className={styles.legendRestaurant} aria-hidden /> Restaurante
                </span>
                <span role="listitem">
                  <span className={styles.legendDropoff} aria-hidden /> Entrega
                </span>
                <span role="listitem">
                  <span className={styles.legendRequestRoute} aria-hidden /> Ruta en solicitud
                </span>
                <span role="listitem">
                  <span className={styles.legendRoute} aria-hidden /> Ruta activa
                </span>
              </div>
            </section>

            <aside className={styles.panels}>
              <MonitorPanel
                title="Cola de pedidos"
                count={sortedQueue.length}
                collapsed={Boolean(collapsedPanels.queue)}
                onToggle={() => togglePanel('queue')}
                sortDir={timeSort.queue}
                onToggleSort={() => toggleSort('queue')}
              >
                <QueueList
                  requests={sortedQueue}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onDetail={handleOpenDetail}
                  onAssign={handleOpenAssign}
                  colorByZone={isAllZones}
                  zoneIds={zoneIds}
                />
              </MonitorPanel>

              <MonitorPanel
                title="Sin asignar"
                count={sortedUnassigned.length}
                collapsed={Boolean(collapsedPanels.unassigned)}
                onToggle={() => togglePanel('unassigned')}
                sortDir={timeSort.unassigned}
                onToggleSort={() => toggleSort('unassigned')}
              >
                <QueueList
                  requests={sortedUnassigned}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  emptyHint="Sin pedidos sin asignar."
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onDetail={handleOpenDetail}
                  onAssign={handleOpenAssign}
                  colorByZone={isAllZones}
                  zoneIds={zoneIds}
                />
              </MonitorPanel>

              <MonitorPanel
                title="En curso"
                count={sortedActive.length}
                collapsed={Boolean(collapsedPanels.active)}
                onToggle={() => togglePanel('active')}
                sortDir={timeSort.active}
                onToggleSort={() => toggleSort('active')}
              >
                <ActiveList
                  requests={sortedActive}
                  canAssign={canManagePartnerships}
                  nowMs={nowMs}
                  focusedRequestId={focusedRequestId}
                  onFocus={handleFocusRequest}
                  onDetail={handleOpenDetail}
                  onAssign={handleOpenAssign}
                  colorByZone={isAllZones}
                  zoneIds={zoneIds}
                />
              </MonitorPanel>

              <MonitorPanel
                title="Ofertas abiertas"
                count={sortedOffers.length}
                collapsed={Boolean(collapsedPanels.offers)}
                onToggle={() => togglePanel('offers')}
                sortDir={timeSort.offers}
                onToggleSort={() => toggleSort('offers')}
              >
                <OffersList offers={sortedOffers} nowMs={nowMs} />
              </MonitorPanel>

              <MonitorPanel
                title="Crédito retenido (efectivo)"
                count={sortedCredit.length}
                collapsed={Boolean(collapsedPanels.credit)}
                onToggle={() => togglePanel('credit')}
                sortDir={timeSort.credit}
                onToggleSort={() => toggleSort('credit')}
              >
                <CreditList holds={sortedCredit} />
              </MonitorPanel>

              <MonitorPanel
                id="monitor-drivers"
                title="Repartidores"
                count={(snapshot?.drivers ?? []).length}
                collapsed={Boolean(collapsedPanels.drivers)}
                onToggle={() => togglePanel('drivers')}
              >
                <DriversList
                  drivers={snapshot?.drivers ?? []}
                  maxPackages={metrics?.max_active_packages_per_driver ?? 3}
                  filter={driverFilter}
                  onFilterChange={handleDriverFilter}
                  focusedDriverId={focusedDriverId}
                  onFocus={handleFocusDriver}
                  colorByZone={isAllZones}
                  zoneIds={zoneIds}
                />
              </MonitorPanel>

              <MonitorPanel
                title="Negocios en operación"
                count={businesses.length}
                collapsed={Boolean(collapsedPanels.businesses)}
                onToggle={() => togglePanel('businesses')}
              >
                <BusinessesList
                  businesses={businesses}
                  focusedRestaurantId={focusedRestaurantId}
                  onFocus={handleFocusBusiness}
                  colorByZone={isAllZones}
                  zoneIds={zoneIds}
                />
              </MonitorPanel>
            </aside>
          </div>
        </>
      )}
      <RequestDetailDrawer
        open={detailRequest !== null}
        request={detailRequest}
        accessToken={accessToken}
        refreshNonce={logNonce}
        onClose={() => setDetailRequestId(null)}
      />
      <AssignDriverDrawer
        open={assigningRequest !== null}
        request={assigningRequest}
        drivers={snapshot?.drivers ?? []}
        submitting={assigning}
        busyKind={assignBusyKind}
        error={assignError}
        onClose={() => {
          setAssigningRequest(null);
          setAssignError(null);
          setAssignBusyKind(null);
        }}
        onAssign={(driverId, itinerary) => {
          void handleManualOffer(driverId, itinerary);
        }}
        onSystemAssign={() => {
          void handleSystemRetry();
        }}
      />
    </PanelPageShell>
  );
}
