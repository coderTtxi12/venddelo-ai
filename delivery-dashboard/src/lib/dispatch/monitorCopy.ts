import type {
  DispatchMonitorMetrics,
  DispatchMonitorOffer,
  DispatchMonitorRequest,
  DispatchMonitorSearchBlocker,
  DispatchMonitorTimelineEvent,
} from '@/lib/api/types';
import { formatMoney } from '@/lib/pricing/tariffUtils';

export function formatShortId(shortId: string | null | undefined): string {
  const value = (shortId ?? '').trim().toUpperCase();
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
}

export function requestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: 'Programado',
    searching: 'Buscando',
    offered: 'Ofertado',
    unassigned: 'Sin asignar',
    assigned: 'Asignado',
    picked_up: 'Recogido',
    in_transit: 'En camino',
  };
  return labels[status] ?? status;
}

export function paymentLabel(method: string): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'transfer') return 'Transferencia';
  if (method === 'card_terminal') return 'Terminal';
  return method;
}

export function caseLabel(caseApplied: string | null | undefined): string | null {
  if (!caseApplied) return null;
  if (caseApplied === 'M') return 'Manual';
  return `Caso ${caseApplied}`;
}

export function caseHint(caseApplied: string | null | undefined): string | null {
  if (caseApplied === 'A') return 'Rider libre más cercano al restaurante';
  if (caseApplied === 'B') return 'Varios pedidos due, riders en paralelo';
  if (caseApplied === 'C') return 'Alta demanda · dropoffs cercanos, un rider';
  if (caseApplied === 'D') return 'Alta demanda · rider en ruta';
  if (caseApplied === 'M') return 'Oferta enviada a mano desde el monitor';
  return null;
}

export function blockerLabel(code: string): string {
  const labels: Record<string, string> = {
    invited: 'Invitado',
    blocked: 'Bloqueado',
    offline: 'Offline',
    gps: 'GPS viejo',
    offer: 'Con oferta',
    rejected: 'Rechazó',
    silent: 'Sin respuesta',
    compartment: 'Caja chica',
    packages: 'Capacidad',
    credit: 'Crédito',
  };
  return labels[code] ?? code;
}

export function formatCountdown(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  const remaining = Math.round((target - nowMs) / 1000);
  if (remaining <= 0) return 'ahora';
  if (remaining < 60) return `${remaining}s`;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSearchStartedAt(value: string): string {
  return new Date(value).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function mapsSearchUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function formatCoords(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatTimelineTime(value: string | null | undefined): string {
  if (!value) return 'sin hora';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'sin hora';
  return new Date(parsed).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function timelineEventTitle(event: DispatchMonitorTimelineEvent): string {
  const driver = event.driver_name?.trim() || 'repartidor';
  if (event.kind === 'requested') return 'Solicitado';
  if (event.kind === 'search_started') return 'Empezó la búsqueda';
  if (event.kind === 'ready') return 'Listo para recoger';
  if (event.kind === 'offered') {
    return event.current ? `Esperando a ${driver}` : `Oferta a ${driver}`;
  }
  if (event.kind === 'rejected') return `${driver} rechazó`;
  if (event.kind === 'expired') return `${driver} no respondió`;
  if (event.kind === 'closed') return `Oferta a ${driver} cerrada`;
  if (event.kind === 'accepted') return `${driver} aceptó`;
  if (event.kind === 'picked_up') return 'Recogido';
  if (event.kind === 'in_transit') return 'En camino';
  if (event.kind === 'delivered') return 'Entregado';
  if (event.kind === 'unassigned') return 'Se agotó la búsqueda';
  if (event.kind === 'cancelled') return 'Cancelado';
  return event.kind;
}

export function timelineEventTone(
  event: DispatchMonitorTimelineEvent,
): 'now' | 'warn' | 'alert' | 'ok' | 'neutral' {
  if (event.current) return 'now';
  if (event.kind === 'rejected' || event.kind === 'expired' || event.kind === 'unassigned') {
    return 'warn';
  }
  if (event.kind === 'cancelled') return 'alert';
  if (event.kind === 'accepted' || event.kind === 'picked_up' || event.kind === 'delivered') {
    return 'ok';
  }
  return 'neutral';
}

export function requestSchedulerLine(request: DispatchMonitorRequest, nowMs: number): string | null {
  if (request.status === 'scheduled') {
    const wait = formatCountdown(request.search_at, nowMs);
    return wait ? `Busca en ${wait}` : `Busca ${formatTime(request.search_at)}`;
  }
  if (request.status === 'searching') {
    const retry = Date.parse(request.next_attempt_at);
    if (Number.isFinite(retry) && retry - nowMs > 2000) {
      const wait = formatCountdown(request.next_attempt_at, nowMs);
      return wait ? `Reintento en ${wait}` : null;
    }
    const timeout = formatCountdown(request.assignment_timeout_at, nowMs);
    return timeout ? `Timeout en ${timeout}` : 'Buscando rider';
  }
  if (request.status === 'offered') {
    const timeout = formatCountdown(request.assignment_timeout_at, nowMs);
    return timeout ? `Búsqueda acaba en ${timeout}` : null;
  }
  if (request.status === 'unassigned') {
    return 'Se agotó el tiempo de búsqueda';
  }
  if (request.status === 'assigned') {
    return `Listo ${formatTime(request.ready_at)} · va al negocio`;
  }
  if (request.status === 'picked_up' || request.status === 'in_transit') {
    return `Listo ${formatTime(request.ready_at)}`;
  }
  return null;
}

export function requestPackageLine(request: DispatchMonitorRequest): string {
  const count = request.package_count ?? 1;
  const size = request.package_size === 'grande' ? 'Grande' : 'Normal';
  const countLabel = count === 1 ? '1 paquete' : `${count} paquetes`;
  return `${countLabel} · ${size}`;
}

export function requestMoneyLine(request: DispatchMonitorRequest): string {
  const fee = request.quoted_fee_cents ?? 0;
  const parts = [paymentLabel(request.payment_method)];
  if (request.payment_method !== 'transfer' && request.collect_cents > 0) {
    parts.push(`cobra ${formatMoney(request.collect_cents)}`);
  }
  if (fee > 0) {
    parts.push(`envío ${formatMoney(fee)}`);
  }
  return parts.join(' · ');
}

export function requestCashDenominationLine(request: DispatchMonitorRequest): string | null {
  if (request.payment_method !== 'cash' || request.cash_denomination_cents == null) {
    return null;
  }
  return `Pagará con ${formatMoney(request.cash_denomination_cents)}`;
}

export function requestLastAssignmentLine(request: DispatchMonitorRequest): string | null {
  const parts = [
    caseLabel(request.last_case),
    request.last_assigned_driver_name?.trim() || null,
    request.dispatch_group_id ? 'grupo C' : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return `Último: ${parts.join(' · ')}`;
}

export function blockersSummary(blockers: DispatchMonitorSearchBlocker[] | undefined): string | null {
  if (!blockers?.length) return null;
  return blockers
    .slice(0, 3)
    .map((item) => `${blockerLabel(String(item.code))} (${item.count})`)
    .join(' · ');
}

export function demandReasonLine(metrics: DispatchMonitorMetrics | undefined): string | null {
  if (!metrics?.high_demand) return null;
  const parts: string[] = [];
  if (metrics.high_demand_few_free) {
    parts.push(`libres ${metrics.high_demand_free_count ?? 0}`);
  }
  if (metrics.high_demand_high_occupancy) {
    const ratio = Math.round((metrics.high_demand_occupied_ratio ?? 0) * 100);
    parts.push(`ocupación ${ratio}%`);
  }
  if (metrics.high_demand_large_queue) {
    parts.push(`cola ${metrics.requests_pending}`);
  }
  return parts.length ? parts.join(' · ') : 'Umbral de demanda alta';
}

export function offerCaseLine(offer: DispatchMonitorOffer): string {
  const label = caseLabel(offer.case_applied) ?? offer.case_applied;
  const hint = caseHint(offer.case_applied);
  return hint ? `${label} · ${hint}` : label;
}

export function gpsAgeLabel(ageSeconds: number | null | undefined): string | null {
  if (ageSeconds == null) return 'Sin GPS';
  if (ageSeconds < 15) return 'GPS ahora';
  if (ageSeconds < 60) return `GPS ${ageSeconds}s`;
  const minutes = Math.floor(ageSeconds / 60);
  return `GPS ${minutes} min`;
}
