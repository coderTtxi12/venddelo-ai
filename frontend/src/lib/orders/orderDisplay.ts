import { activeOptionGroups } from '@/components/digital-menu/optionGroupHint';
import type { AppliedOrderDiscount, Order, OrderItem, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { PAYMENT_METHOD_LABELS } from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';

export type ResolvedOrderOption = {
  groupTitle: string;
  labels: string[];
};

export function formatOrderShortId(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function extractOrderRefFromNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(/Ref\.?\s*pedido\s*#?([A-Z0-9]{6,12})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function formatOrderDisplayId(order: Order): string {
  return extractOrderRefFromNote(order.note) ?? formatOrderShortId(order.id);
}

export function formatOrderElapsed(createdAt: string, now = Date.now()): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return '—';

  const diffMs = Math.max(0, now - created);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) {
    return rem > 0 ? `Hace ${hours}h ${rem}m` : `Hace ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? 'Ayer' : `Hace ${days} días`;
}

export function formatOrderClock(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatOrderDateTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function countOrderItems(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function resolveOrderItemOptions(
  item: OrderItem,
  productsById: ReadonlyMap<string, Product>,
): ResolvedOrderOption[] {
  const selected = item.selected_options;
  if (!selected || Object.keys(selected).length === 0) return [];

  const product = item.product_id ? productsById.get(item.product_id) : undefined;
  if (!product) {
    return Object.entries(selected).flatMap(([groupId, optionIds]) =>
      optionIds.length > 0
        ? [{ groupTitle: 'Opciones', labels: optionIds }]
        : [],
    );
  }

  const rows: ResolvedOrderOption[] = [];
  for (const group of activeOptionGroups(product)) {
    const optionIds = selected[group.id] ?? [];
    if (optionIds.length === 0) continue;
    const labels = group.items
      .filter((option) => optionIds.includes(option.id))
      .map((option) => option.label);
    if (labels.length > 0) {
      rows.push({ groupTitle: group.title, labels });
    }
  }
  return rows;
}

export function splitOrderNote(note: string | null): { reference: string | null; details: string | null } {
  if (!note?.trim()) return { reference: null, details: null };
  const parts = note.split(' | ').map((part) => part.trim()).filter(Boolean);
  const reference = parts.find((part) => /ref\.?\s*pedido/i.test(part)) ?? null;
  const details = parts.filter((part) => part !== reference).join(' | ') || null;
  return { reference, details };
}

export function formatOrderPaymentLabel(paymentMethod: Order['payment_method']): string {
  return PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod;
}

export function formatOrderTypeLabel(type: Order['type']): string {
  return RESTAURANT_SERVICE_LABELS[type] ?? type;
}

export function formatCents(cents: number, currency = 'MXN'): string {
  return formatMoney(cents / 100, currency);
}

export {
  collectOrderDiscountRows,
  resolveOrderItemDiscounts,
  type OrderDiscountRow,
} from '@/lib/orders/orderItemDiscounts';

export function resolveOrderItemDiscountCents(item: OrderItem): number {
  if (item.discount_cents > 0) return item.discount_cents;
  if (item.line_subtotal_cents > item.line_total_cents) {
    return item.line_subtotal_cents - item.line_total_cents;
  }
  return item.applied_discounts.reduce(
    (sum, discount) => sum + (discount.applied ? discount.discount_cents : 0),
    0,
  );
}

/** Precio de línea antes de descuentos (base + opciones × cantidad). */
export function orderItemPreDiscountCents(
  item: OrderItem,
  discounts: AppliedOrderDiscount[],
): number {
  const discountTotal = discounts.reduce((sum, row) => sum + row.discount_cents, 0);
  return item.line_total_cents + discountTotal;
}

export function sumOrderLineDiscountCents(order: Order): number {
  const fromItems = order.items.reduce(
    (sum, item) => sum + resolveOrderItemDiscountCents(item),
    0,
  );
  if (fromItems > 0) return fromItems;

  const before = order.subtotal_before_discount_cents;
  if (before > 0 && order.subtotal_cents < before) {
    return before - order.subtotal_cents;
  }
  return 0;
}

export function resolveOrderLevelDiscounts(order: Order): AppliedOrderDiscount[] {
  const applied = (order.applied_order_discounts ?? []).filter(
    (discount) => discount.applied && discount.discount_cents > 0,
  );
  if (applied.length > 0) return applied;
  if (order.discount_cents <= 0) return [];
  return [
    {
      label: 'Descuento en pedido',
      badge: null,
      discount_cents: order.discount_cents,
      applied: true,
    },
  ];
}

export function sumOrderLevelDiscountCents(order: Order): number {
  const fromSnapshots = resolveOrderLevelDiscounts(order).reduce(
    (sum, discount) => sum + discount.discount_cents,
    0,
  );
  if (fromSnapshots > 0) return fromSnapshots;
  return Math.max(0, order.discount_cents);
}

export type OrderTotalsBreakdown = {
  subtotalBeforeCents: number;
  lineDiscountCents: number;
  orderDiscountCents: number;
  /** Productos del restaurante tras descuentos, sin envío. */
  restaurantSubtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
};

export function buildOrderTotalsBreakdown(order: Order): OrderTotalsBreakdown {
  const lineDiscountCents = sumOrderLineDiscountCents(order);
  const orderDiscountCents = sumOrderLevelDiscountCents(order);
  const subtotalBeforeCents =
    order.subtotal_before_discount_cents > 0
      ? order.subtotal_before_discount_cents
      : order.subtotal_cents + lineDiscountCents;

  const restaurantFromOrder = Math.max(0, order.subtotal_cents - orderDiscountCents);
  const restaurantComputed = Math.max(
    0,
    subtotalBeforeCents - lineDiscountCents - orderDiscountCents,
  );
  const restaurantSubtotalCents =
    restaurantFromOrder > 0 ? restaurantFromOrder : restaurantComputed;

  return {
    subtotalBeforeCents,
    lineDiscountCents,
    orderDiscountCents,
    restaurantSubtotalCents,
    deliveryFeeCents: order.delivery_fee_cents,
    totalCents: order.total_cents,
  };
}

export function sortOrdersNewestFirst(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
