import type { DispatchStatus } from '@/lib/api/dispatch';

export const publicTrackingStatusCopy: Record<DispatchStatus, { title: string; detail: string }> = {
  scheduled: {
    title: 'Cocinando tu pedido',
    detail: 'El restaurante está preparando tu comida. Después buscaremos un repartidor.',
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
    id: 'cooking',
    label: 'Cocinando',
    hint: 'El restaurante prepara tu pedido.',
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
  'scheduled',
  'searching',
  'offered',
  'unassigned',
]);

export function publicTrackingRouteCaption(status: DispatchStatus, hasRider: boolean): string {
  if (status === 'assigned' && hasRider) return 'El repartidor va rumbo al restaurante';
  if (status === 'picked_up' && hasRider) return 'El repartidor está en el restaurante';
  if (status === 'in_transit' && hasRider) return 'El repartidor va rumbo a tu ubicación';
  if (PENDING_STATUSES.has(status)) return 'Ruta del restaurante a tu destino';
  if (status === 'delivered') return 'Entrega completada';
  return 'Ubicación de entrega';
}
