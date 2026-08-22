import type { Order } from '@/lib/api/types';

export function buildOrderGoogleMapsUrl(order: Order): string | null {
  if (order.type !== 'delivery') return null;

  if (order.delivery_latitude != null && order.delivery_longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${order.delivery_latitude},${order.delivery_longitude}`;
  }

  const address = order.delivery_address?.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export const KITCHEN_CANCEL_REASONS = [
  'Producto agotado',
  'Fuera de zona de entrega',
  'Restaurante cerrado',
  'No podemos prepararlo a tiempo',
  'Datos incorrectos en el pedido',
  'Otro motivo',
] as const;

export type KitchenCancelReason = (typeof KITCHEN_CANCEL_REASONS)[number];
