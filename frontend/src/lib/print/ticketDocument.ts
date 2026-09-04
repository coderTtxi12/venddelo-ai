import type { Order, Product } from '@/lib/api/types';
import { formatOrderCustomerPhone } from '@/lib/digital-menu/checkout/customerPhone';
import {
  buildOrderTotalsBreakdown,
  formatCents,
  formatOrderDateTime,
  formatOrderDisplayId,
  formatOrderPaymentLabel,
  formatOrderTypeLabel,
  orderItemPreDiscountCents,
  resolveOrderItemOptions,
  splitOrderNote,
} from '@/lib/orders/orderDisplay';
import { splitDeliveryAddress } from '@/lib/orders/kitchenDispatch';
import type { TicketPrintSettings } from './ticketSettings';
import { DEFAULT_TICKET_PRINT_SETTINGS } from './ticketSettings';

export type TicketLine =
  | { kind: 'brand'; text: string }
  | { kind: 'muted'; text: string }
  | { kind: 'rule' }
  | { kind: 'kv'; label: string; value: string }
  | { kind: 'title'; text: string }
  | { kind: 'item'; qty: number; name: string; price: string }
  | { kind: 'option'; text: string }
  | { kind: 'total'; label: string; value: string; strong?: boolean }
  | { kind: 'center'; text: string };

export type KitchenTicketDocument = {
  paperWidthMm: 58 | 80;
  copies: number;
  logoUrl: string | null;
  brandName: string;
  lines: TicketLine[];
};

export const sampleKitchenTicketOrder: Order = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  restaurant_id: 'preview',
  type: 'takeout',
  customer_name: 'María López',
  customer_phone: '+525512345678',
  payment_method: 'cash',
  subtotal_cents: 18600,
  subtotal_before_discount_cents: 18600,
  discount_cents: 0,
  total_cents: 18600,
  applied_coupon_id: null,
  applied_coupon_code: null,
  coupon_discount_cents: 0,
  coupon_waived_delivery_cents: 0,
  applied_order_promotion_id: null,
  applied_order_discounts: [],
  status: 'pending',
  delivery_address: null,
  delivery_latitude: null,
  delivery_longitude: null,
  delivery_fee_cents: 0,
  cash_denomination_cents: 20000,
  cancellation_reason: null,
  idempotency_key: null,
  note: 'Sin cebolla',
  kds_cleared_at: null,
  created_at: '2026-08-26T18:30:00Z',
  updated_at: '2026-08-26T18:30:00Z',
  items: [
    {
      id: 'preview-item-1',
      product_id: null,
      product_name: 'Tacos al Pastor',
      product_image_path: null,
      quantity: 2,
      unit_price_cents: 6500,
      selected_options: null,
      line_subtotal_cents: 13000,
      discount_cents: 0,
      line_total_cents: 13000,
      applied_promotion_id: null,
      applied_discounts: [],
    },
    {
      id: 'preview-item-2',
      product_id: null,
      product_name: 'Agua de Horchata',
      product_image_path: null,
      quantity: 1,
      unit_price_cents: 5600,
      selected_options: null,
      line_subtotal_cents: 5600,
      discount_cents: 0,
      line_total_cents: 5600,
      applied_promotion_id: null,
      applied_discounts: [],
    },
  ],
};

export function productIdsNeededForTicketOptions(
  order: Order,
  productsById: ReadonlyMap<string, Product>,
): string[] {
  const ids: string[] = [];
  for (const item of order.items) {
    if (!item.product_id) continue;
    const selected = item.selected_options;
    if (!selected || Object.keys(selected).length === 0) continue;
    if (!productsById.has(item.product_id)) ids.push(item.product_id);
  }
  return [...new Set(ids)];
}

export function resolveTicketBrandName(
  settings: TicketPrintSettings,
  restaurantName: string,
): string {
  return settings.brand_name.trim() || restaurantName.trim() || 'Restaurante';
}

export function buildKitchenTicketDocument(opts: {
  order: Order;
  settings: TicketPrintSettings;
  restaurantName: string;
  restaurantAddress?: string | null;
  logoUrl?: string | null;
  productsById?: ReadonlyMap<string, Product>;
}): KitchenTicketDocument {
  const settings = opts.settings;
  const brandName = resolveTicketBrandName(settings, opts.restaurantName);
  const logoUrl = settings.show_logo ? opts.logoUrl ?? null : null;
  const lines: TicketLine[] = [{ kind: 'brand', text: brandName }];

  if (settings.header_extra.trim()) {
    lines.push({ kind: 'muted', text: settings.header_extra.trim() });
  }
  if (settings.show_restaurant_address && opts.restaurantAddress?.trim()) {
    lines.push({ kind: 'muted', text: opts.restaurantAddress.trim() });
  }

  lines.push({ kind: 'rule' });
  lines.push({ kind: 'kv', label: 'Pedido', value: `#${formatOrderDisplayId(opts.order)}` });
  if (settings.show_order_type) {
    lines.push({ kind: 'kv', label: 'Tipo', value: formatOrderTypeLabel(opts.order.type) });
  }
  if (settings.show_datetime) {
    lines.push({ kind: 'kv', label: 'Fecha', value: formatOrderDateTime(opts.order.created_at) });
  }
  if (settings.show_customer && opts.order.customer_name.trim()) {
    lines.push({ kind: 'kv', label: 'Cliente', value: opts.order.customer_name.trim() });
  }
  if (settings.show_phone && opts.order.customer_phone.trim()) {
    lines.push({
      kind: 'kv',
      label: 'Teléfono',
      value: formatOrderCustomerPhone(opts.order.customer_phone),
    });
  }
  if (settings.show_address && opts.order.type === 'delivery' && opts.order.delivery_address) {
    const { address, references } = splitDeliveryAddress(opts.order.delivery_address);
    if (address) {
      lines.push({ kind: 'kv', label: 'Entrega', value: address });
    }
    if (references) {
      lines.push({ kind: 'kv', label: 'Refs.', value: references });
    }
  }
  if (settings.show_payment) {
    const payment = formatOrderPaymentLabel(opts.order.payment_method);
    const cash =
      opts.order.payment_method === 'cash' && opts.order.cash_denomination_cents
        ? ` · con ${formatCents(opts.order.cash_denomination_cents)}`
        : '';
    lines.push({ kind: 'kv', label: 'Pago', value: `${payment}${cash}` });
  }

  const noteParts = splitOrderNote(opts.order.note);
  if (settings.show_notes && noteParts.details) {
    lines.push({ kind: 'kv', label: 'Notas', value: noteParts.details });
  }

  if (settings.show_items) {
    lines.push({ kind: 'rule' });
    lines.push({ kind: 'title', text: 'Artículos' });
    const productsById = opts.productsById ?? new Map();
    for (const item of opts.order.items) {
      const preDiscountCents =
        item.line_subtotal_cents > 0
          ? item.line_subtotal_cents
          : orderItemPreDiscountCents(item, item.applied_discounts ?? []);
      lines.push({
        kind: 'item',
        qty: item.quantity,
        name: item.product_name,
        price: formatCents(preDiscountCents),
      });
      const options = resolveOrderItemOptions(item, productsById);
      for (const option of options) {
        lines.push({
          kind: 'option',
          text: `${option.groupTitle}: ${option.labels.join(', ')}`,
        });
      }
    }
  }

  const totals = buildOrderTotalsBreakdown(opts.order);
  lines.push({ kind: 'rule' });
  lines.push({
    kind: 'total',
    label: 'Subtotal',
    value: formatCents(totals.subtotalBeforeCents),
  });
  if (totals.lineDiscountCents > 0) {
    lines.push({
      kind: 'total',
      label: 'Descuentos',
      value: `-${formatCents(totals.lineDiscountCents)}`,
    });
  }
  if (totals.promoOrderDiscountCents > 0) {
    lines.push({
      kind: 'total',
      label: 'Descuento del pedido',
      value: `-${formatCents(totals.promoOrderDiscountCents)}`,
    });
  }
  if (totals.appliedCouponCode) {
    lines.push({
      kind: 'total',
      label: `Cupón ${totals.appliedCouponCode}`,
      value:
        totals.couponWaivedDeliveryCents > 0
          ? 'Envío gratis'
          : totals.couponDiscountCents > 0
            ? `-${formatCents(totals.couponDiscountCents)}`
            : '—',
    });
  }
  if (totals.deliveryFeeCents > 0) {
    lines.push({
      kind: 'total',
      label: 'Envío',
      value: formatCents(totals.deliveryFeeCents),
    });
  }
  lines.push({
    kind: 'total',
    label: 'Total',
    value: formatCents(totals.totalCents),
    strong: true,
  });

  if (settings.footer_message.trim()) {
    lines.push({ kind: 'rule' });
    lines.push({ kind: 'center', text: settings.footer_message.trim() });
  }

  return {
    paperWidthMm: settings.paper_width_mm,
    copies: settings.copies,
    logoUrl,
    brandName,
    lines,
  };
}

export function previewKitchenTicketDocument(opts: {
  settings: TicketPrintSettings;
  restaurantName: string;
  restaurantAddress?: string | null;
  logoUrl?: string | null;
}): KitchenTicketDocument {
  return buildKitchenTicketDocument({
    order: sampleKitchenTicketOrder,
    settings: opts.settings ?? DEFAULT_TICKET_PRINT_SETTINGS,
    restaurantName: opts.restaurantName,
    restaurantAddress: opts.restaurantAddress,
    logoUrl: opts.logoUrl,
  });
}
