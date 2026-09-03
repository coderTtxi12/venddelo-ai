import { historicalOptionGroups } from '@/components/digital-menu/optionGroupHint';
import type { AppliedOrderDiscount, Order, OrderItem, Product } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import {
  customerPayableDeliveryCents,
  providerDeliveryFeeCents,
} from '@/lib/orders/deliveryFee';
import { PAYMENT_METHOD_LABELS } from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';

export type ResolvedOrderOption = {
  groupId: string;
  groupTitle: string;
  labels: string[];
};

function selectedOptionIdsForGroup(
  selected: Record<string, unknown>,
  groupId: string,
): string[] {
  const raw = selected[groupId];
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  if (typeof raw === 'string' && raw.length > 0) return [raw];
  return [];
}

export function formatOrderShortId(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 5).toUpperCase();
}

export function extractOrderRefFromNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const match = note.match(/Ref\.?\s*pedido\s*#?([A-Z0-9]{5,12})/i);
  return match?.[1]?.toUpperCase().slice(0, 5) ?? null;
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
  if (!product) return [];

  const rows: ResolvedOrderOption[] = [];
  for (const group of historicalOptionGroups(product)) {
    const optionIds = selectedOptionIdsForGroup(selected, group.id);
    if (optionIds.length === 0) continue;
    const labels = optionIds
      .map((optionId) => group.items.find((option) => option.id === optionId)?.label)
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) {
      rows.push({ groupId: group.id, groupTitle: group.title, labels });
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
  return resolvePromoOrderLevelDiscounts(order);
}

const COUPON_DISCOUNT_LABEL_PREFIX = /^Cupón\s+/i;

export function isCouponAppliedOrderDiscount(discount: AppliedOrderDiscount): boolean {
  return COUPON_DISCOUNT_LABEL_PREFIX.test(discount.label);
}

export function resolvePromoOrderLevelDiscounts(order: Order): AppliedOrderDiscount[] {
  const applied = (order.applied_order_discounts ?? []).filter(
    (discount) =>
      discount.applied && discount.discount_cents > 0 && !isCouponAppliedOrderDiscount(discount),
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

export function resolveCouponSavingsCents(order: Order): {
  code: string | null;
  discountCents: number;
  waivedDeliveryCents: number;
} {
  const code = order.applied_coupon_code?.trim() || null;
  if (!code) {
    return { code: null, discountCents: 0, waivedDeliveryCents: 0 };
  }
  return {
    code,
    discountCents: order.coupon_discount_cents ?? 0,
    waivedDeliveryCents: order.coupon_waived_delivery_cents ?? 0,
  };
}

export function sumPromoOrderLevelDiscountCents(order: Order): number {
  return resolvePromoOrderLevelDiscounts(order).reduce(
    (sum, discount) => sum + discount.discount_cents,
    0,
  );
}

export function sumOrderLevelDiscountCents(order: Order): number {
  const coupon = resolveCouponSavingsCents(order);
  return sumPromoOrderLevelDiscountCents(order) + coupon.discountCents;
}

export type OrderTotalsBreakdown = {
  subtotalBeforeCents: number;
  lineDiscountCents: number;
  /** Descuentos de promoción a nivel pedido (sin cupón). */
  promoOrderDiscountCents: number;
  couponDiscountCents: number;
  couponWaivedDeliveryCents: number;
  appliedCouponCode: string | null;
  /** @deprecated Usa promoOrderDiscountCents. */
  orderDiscountCents: number;
  /** Productos del restaurante tras descuentos, sin envío. */
  restaurantSubtotalCents: number;
  /** Tarifa B2B del delivery (lo que cobra el proveedor / absorbe el restaurante). */
  providerDeliveryFeeCents: number;
  /** Lo que paga el cliente por envío (0 si hay envío gratis). */
  customerDeliveryFeeCents: number;
  /**
   * @deprecated Prefer customerDeliveryFeeCents (customer-facing).
   * Kept as customer due for existing kitchen call sites.
   */
  deliveryFeeCents: number;
  totalCents: number;
};

export function buildOrderTotalsBreakdown(order: Order): OrderTotalsBreakdown {
  const lineDiscountCents = sumOrderLineDiscountCents(order);
  const promoOrderDiscountCents = sumPromoOrderLevelDiscountCents(order);
  const coupon = resolveCouponSavingsCents(order);
  const orderLevelDiscountCents = promoOrderDiscountCents + coupon.discountCents;
  const subtotalBeforeCents =
    order.subtotal_before_discount_cents > 0
      ? order.subtotal_before_discount_cents
      : order.subtotal_cents + lineDiscountCents;

  const restaurantComputed = Math.max(
    0,
    subtotalBeforeCents - lineDiscountCents - orderLevelDiscountCents,
  );
  const restaurantSubtotalCents =
    order.subtotal_cents > 0 ? order.subtotal_cents : restaurantComputed;

  const waivedDeliveryCents = order.coupon_waived_delivery_cents ?? 0;
  const providerFee = providerDeliveryFeeCents(order.delivery_fee_cents, waivedDeliveryCents);
  const customerFee = customerPayableDeliveryCents(providerFee, waivedDeliveryCents);

  return {
    subtotalBeforeCents,
    lineDiscountCents,
    promoOrderDiscountCents,
    couponDiscountCents: coupon.discountCents,
    couponWaivedDeliveryCents: waivedDeliveryCents,
    appliedCouponCode: coupon.code,
    orderDiscountCents: promoOrderDiscountCents,
    restaurantSubtotalCents,
    providerDeliveryFeeCents: providerFee,
    customerDeliveryFeeCents: customerFee,
    deliveryFeeCents: customerFee,
    totalCents: order.total_cents,
  };
}

export function sortOrdersNewestFirst(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
