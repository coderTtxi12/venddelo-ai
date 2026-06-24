import type { Order } from '@/lib/api/types';
import { formatOrderDisplayId } from '@/lib/orders/orderDisplay';

export function buildOrderGoogleMapsUrl(order: Order): string | null {
  if (order.type !== 'delivery') return null;

  if (order.delivery_latitude != null && order.delivery_longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${order.delivery_latitude},${order.delivery_longitude}`;
  }

  const address = order.delivery_address?.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function buildOrderAcceptedWhatsAppMessage(order: Order): string {
  const ref = formatOrderDisplayId(order);
  return [
    `¡Hola ${order.customer_name}! 👋`,
    `Tu pedido #${ref} fue *aceptado* y ya lo estamos preparando. 🍳`,
    '¡Gracias por tu preferencia!',
  ].join('\n');
}

export function buildOrderCancelledWhatsAppMessage(order: Order, reason: string): string {
  const ref = formatOrderDisplayId(order);
  return [
    `Hola ${order.customer_name}, lamentamos informarte que tu pedido #${ref} no pudo ser aceptado. 😔`,
    `Motivo: ${reason}`,
    'Si tienes dudas, escríbenos por aquí. ¡Gracias por tu comprensión!',
  ].join('\n');
}

/** Opens WhatsApp in a new tab with a prefilled customer message. */
export function openCustomerWhatsAppMessage(phone: string | null | undefined, message: string): void {
  const digits = phone?.replace(/\D/g, '') ?? '';
  const hasCustomerPhone = digits.length >= 10 && phone !== 'whatsapp';
  const url = hasCustomerPhone
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
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
