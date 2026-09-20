import type { DispatchStatus } from '@/lib/api/dispatch';

export const publicTrackingStatusCopy: Record<DispatchStatus, { title: string; detail: string }> = {
  accepted: {
    title: 'Pedido recibido',
    detail: 'Aún no se ha aceptado el pedido. En cuanto el restaurante lo confirme, empezará a prepararlo.',
  },
  scheduled: {
    title: 'Cocinando tu pedido',
    detail: 'El restaurante está preparando tu pedido. Después buscaremos un repartidor.',
  },
  searching: {
    title: 'Buscando repartidor',
    detail: 'Estamos buscando al mejor repartidor disponible para tu entrega.',
  },
  offered: {
    title: 'Contactando a un repartidor',
    detail: 'Un repartidor está revisando la solicitud.',
  },
  assigned: {
    title: 'Repartidor asignado',
    detail: 'El repartidor se dirige al restaurante.',
  },
  picked_up: {
    title: 'El repartidor llegó al restaurante',
    detail: 'Está recogiendo tu pedido.',
  },
  in_transit: {
    title: 'Tu entrega va en camino',
    detail: 'El repartidor se dirige a la ubicación de entrega.',
  },
  delivered: {
    title: 'Entregado',
    detail: 'Tu pedido llegó a destino.',
  },
  unassigned: {
    title: 'Aún no encontramos repartidor',
    detail: 'El restaurante puede volver a intentar la búsqueda.',
  },
  cancelled: {
    title: 'Entrega cancelada',
    detail: 'Esta solicitud fue cancelada.',
  },
};

export const publicTrackingTimelineSteps = [
  {
    id: 'accepted',
    label: 'Recibido',
    hint: 'Aún no se ha aceptado el pedido.',
  },
  {
    id: 'scheduled',
    label: 'Cocinando',
    hint: 'El restaurante está preparando tu pedido.',
  },
  {
    id: 'searching',
    label: 'Buscando repartidor',
    hint: 'El sistema busca al repartidor más cercano.',
  },
  {
    id: 'assigned',
    label: 'Repartidor asignado',
    hint: 'Va rumbo al restaurante a recoger.',
  },
  {
    id: 'picked_up',
    label: 'En el restaurante',
    hint: 'Está recogiendo tu pedido.',
  },
  {
    id: 'in_transit',
    label: 'En camino',
    hint: 'Se dirige a tu ubicación.',
  },
  {
    id: 'delivered',
    label: 'Entregado',
    hint: 'Tu pedido llegó a destino.',
  },
] as const;

const PENDING_STATUSES = new Set<DispatchStatus>([
  'accepted',
  'scheduled',
  'searching',
  'offered',
  'unassigned',
]);

const LIVE_MAP_STATUSES = new Set<DispatchStatus>([
  'assigned',
  'picked_up',
  'in_transit',
]);

export const publicTrackingMapPendingCopy = {
  title: 'El mapa aparece cuando haya repartidor',
  detail: 'En cuanto asignemos un repartidor, aquí verás su ubicación en tiempo real.',
};

export type PublicTrackingConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type PublicTrackingConnectionBar = {
  tone: 'live' | 'busy' | 'stale';
  title: string;
  detail: string;
  action: string | null;
};

export type PublicTrackingConnectionSignals = {
  socketStatus: PublicTrackingConnectionState;
  isOnline: boolean;
  fetchFailed: boolean;
  connectingTimedOut: boolean;
  notFound?: boolean;
};

export const PUBLIC_TRACKING_CONNECTING_TIMEOUT_MS = 8000;

export function publicTrackingConnectionBar(
  signals: PublicTrackingConnectionSignals,
): PublicTrackingConnectionBar {
  if (!signals.isOnline) {
    return {
      tone: 'stale',
      title: 'Sin conexión a internet',
      detail: 'Revisa tu Wi‑Fi o datos móviles e inténtalo de nuevo.',
      action: 'Recargar',
    };
  }

  if (signals.notFound) {
    return {
      tone: 'stale',
      title: 'No encontramos este rastreo',
      detail: 'El enlace puede haber caducado o no ser válido. Recarga por si fue un fallo temporal.',
      action: 'Recargar',
    };
  }

  if (signals.fetchFailed) {
    return {
      tone: 'stale',
      title: 'No pudimos actualizar tu pedido',
      detail: 'Hubo un problema al cargar el estado. Recarga para intentarlo de nuevo.',
      action: 'Recargar',
    };
  }

  if (signals.connectingTimedOut) {
    return {
      tone: 'stale',
      title: 'La conexión en vivo no responde',
      detail: 'Si el pedido no avanza, recarga la página.',
      action: 'Recargar',
    };
  }

  if (signals.socketStatus === 'reconnecting') {
    return {
      tone: 'stale',
      title: 'Se cortó la conexión en vivo',
      detail: 'Si el pedido no avanza, recarga la página.',
      action: 'Recargar',
    };
  }

  if (signals.socketStatus === 'live') {
    return {
      tone: 'live',
      title: 'En vivo',
      detail: 'El estado de tu pedido se actualiza solo.',
      action: null,
    };
  }

  return {
    tone: 'busy',
    title: 'Conectando',
    detail: 'Estamos abriendo la ubicación en vivo.',
    action: null,
  };
}

export function publicTrackingShowsLiveMap(status: DispatchStatus, hasRider: boolean): boolean {
  return hasRider && LIVE_MAP_STATUSES.has(status);
}

export function publicTrackingRouteCaption(status: DispatchStatus, hasRider: boolean): string {
  if (status === 'assigned' && hasRider) return 'El repartidor va rumbo al restaurante';
  if (status === 'picked_up' && hasRider) return 'El repartidor está en el restaurante';
  if (status === 'in_transit' && hasRider) return 'El repartidor va rumbo a tu ubicación';
  if (PENDING_STATUSES.has(status)) return 'Ruta del restaurante a tu destino';
  if (status === 'delivered') return 'Entrega completada';
  return 'Ubicación de entrega';
}
