import type { CartQuote } from '@/lib/api/public';
import type { Product, Promotion } from '@/lib/api/types';
import {
  buildCheckoutLineBreakdowns,
  promotionDisplayName,
  type CheckoutDiscountDetail,
  type CheckoutLineBreakdown,
} from '@/lib/digital-menu/cart/buildCheckoutLineBreakdown';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { formatMoney } from '@/lib/currency';
import {
  PAYMENT_METHOD_LABELS,
} from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';
import {
  buildCheckoutCustomerPhoneE164,
  formatOrderCustomerPhone,
} from '@/lib/digital-menu/checkout/customerPhone';
import type { Restaurant } from '@/lib/api/types';
import { buildGoogleMapsLink } from '@/lib/googleMaps';
import { formatCheckoutOrderIdLabel } from './createCheckoutOrderRef';

export type WhatsAppRestaurantLocation = Pick<
  Restaurant,
  'name' | 'address' | 'latitude' | 'longitude' | 'place_id'
>;

export type WhatsAppOrderMessageInput = {
  orderId: string;
  restaurantName: string;
  restaurantLocation?: WhatsAppRestaurantLocation | null;
  currency: string;
  lines: PublicMenuCartLine[];
  quote: CartQuote;
  fulfillment: CheckoutFulfillment;
  productsById: Map<string, Product>;
  promotionsById: Map<string, Promotion>;
  itemCount: number;
};

function bold(text: string): string {
  return `*${text}*`;
}

function formatDiscountDetailLine(detail: CheckoutDiscountDetail, currency: string): string {
  const status = detail.applied
    ? detail.badge
      ? `Aplicada · ${detail.badge}`
      : 'Aplicada'
    : (detail.notAppliedReason ?? 'No aplicada');
  const amount =
    detail.applied && detail.discountCents > 0
      ? `-${formatMoney(detail.discountCents / 100, currency)}`
      : '—';
  return `   - ${detail.label} (${status}): ${amount}`;
}

function formatLinePromotionRows(breakdown: CheckoutLineBreakdown, currency: string): string[] {
  if (breakdown.discountDetails.length > 0) {
    return [
      '   Promociones:',
      ...breakdown.discountDetails.map((detail) => formatDiscountDetailLine(detail, currency)),
    ];
  }

  if (breakdown.discountCents > 0) {
    const hint = breakdown.promoLabel ? ` (${breakdown.promoLabel})` : '';
    return [`   Promo${hint}: -${formatMoney(breakdown.discountCents / 100, currency)}`];
  }

  return [];
}

function formatLineOptions(
  breakdown: ReturnType<typeof buildCheckoutLineBreakdowns>[number],
  currency: string,
): string[] {
  const rows: string[] = [];

  for (const group of breakdown.optionGroups) {
    for (const option of group.items) {
      const price =
        option.lineTotalCents > 0
          ? ` (+${formatMoney(option.lineTotalCents / 100, currency)})`
          : '';
      rows.push(`   - ${option.label}${price}`);
    }
  }

  return rows;
}

export function formatWhatsAppOrderMessage(input: WhatsAppOrderMessageInput): string {
  const {
    orderId,
    restaurantName,
    restaurantLocation,
    currency,
    lines,
    quote,
    fulfillment,
    productsById,
    promotionsById,
    itemCount,
  } = input;

  const quoteNow = new Date(quote.server_now);
  const lineBreakdowns = buildCheckoutLineBreakdowns(
    lines,
    quote.lines,
    productsById,
    promotionsById,
    quote.timezone,
    quoteNow,
  );

  const subtotalBefore = quote.subtotal_before_discount_cents / 100;
  const lineDiscountTotal =
    lineBreakdowns.reduce((sum, breakdown) => sum + breakdown.discountCents, 0) / 100;
  const orderDiscount = quote.order_discount_cents / 100;
  const orderPromo = quote.applied_order_promotion_id
    ? promotionsById.get(quote.applied_order_promotion_id)
    : undefined;
  const orderPromoLabel = promotionDisplayName(orderPromo);
  const deliveryFee =
    fulfillment.serviceType === 'delivery' && fulfillment.deliveryFeeCents != null
      ? fulfillment.deliveryFeeCents / 100
      : 0;
  const grandTotal = quote.total_cents / 100 + deliveryFee;
  const itemLabel = itemCount === 1 ? '1 artículo' : `${itemCount} artículos`;

  const parts: string[] = [
    bold(`Nuevo pedido — ${restaurantName}`),
    `${bold('Pedido')} ${formatCheckoutOrderIdLabel(orderId)}`,
    '',
    `${bold('Cliente:')} ${fulfillment.customerName.trim()}`,
    `${bold('WhatsApp:')} ${formatOrderCustomerPhone(buildCheckoutCustomerPhoneE164(fulfillment))}`,
    '',
    `${bold('Tipo de pedido:')} ${RESTAURANT_SERVICE_LABELS[fulfillment.serviceType]}`,
  ];

  if (fulfillment.serviceType === 'delivery') {
    parts.push(`${bold('Dirección:')} ${fulfillment.deliveryAddress.trim()}`);
    const details = fulfillment.deliveryAddressDetails.trim();
    if (details) {
      parts.push(`${bold('Referencias:')} ${details}`);
    }
    const deliveryMapsUrl = buildGoogleMapsDeliveryUrl(fulfillment);
    if (deliveryMapsUrl) {
      parts.push(`${bold('Ubicación en mapa:')}`);
      parts.push(deliveryMapsUrl);
    }

    const restaurantMapsUrl = restaurantLocation
      ? buildGoogleMapsLink(restaurantLocation)
      : null;
    if (restaurantMapsUrl) {
      parts.push(`${bold('Ubicación del restaurante:')}`);
      parts.push(restaurantMapsUrl);
    }
  }

  if (fulfillment.paymentMethod) {
    parts.push(`${bold('Método de pago:')} ${PAYMENT_METHOD_LABELS[fulfillment.paymentMethod]}`);
  }

  if (
    fulfillment.serviceType === 'delivery' &&
    fulfillment.paymentMethod === 'cash' &&
    fulfillment.cashDenominationCents != null
  ) {
    parts.push(
      `${bold('Pagará con:')} ${formatMoney(fulfillment.cashDenominationCents / 100, currency)}`,
    );
    const changeCents = fulfillment.cashDenominationCents - Math.round(grandTotal * 100);
    if (changeCents > 0) {
      parts.push(`${bold('Cambio:')} ${formatMoney(changeCents / 100, currency)}`);
    }
  }

  parts.push('', '——————————————', bold('DETALLE DEL PEDIDO'), '');

  lineBreakdowns.forEach((breakdown, index) => {
    const { cartLine } = breakdown;
    parts.push(
      bold(`${index + 1}. ${cartLine.productName} x${cartLine.quantity}`),
      `   Precio base: ${formatMoney(breakdown.baseUnitCents / 100, currency)} c/u`,
    );

    parts.push(...formatLineOptions(breakdown, currency));

    if (cartLine.notes?.trim()) {
      parts.push(`   Nota: ${cartLine.notes.trim()}`);
    }

    parts.push(`   Subtotal: ${formatMoney(breakdown.subtotalBeforeDiscountCents / 100, currency)}`);

    parts.push(...formatLinePromotionRows(breakdown, currency));

    parts.push(`   ${bold(`Total artículo: ${formatMoney(breakdown.lineTotalCents / 100, currency)}`)}`, '');
  });

  parts.push(
    '——————————————',
    `Subtotal (${itemLabel}): ${formatMoney(subtotalBefore, currency)}`,
  );

  if (lineDiscountTotal > 0) {
    parts.push(`Descuentos por artículo: -${formatMoney(lineDiscountTotal, currency)}`);
  }

  if (orderDiscount > 0) {
    const hint = orderPromoLabel ? ` (${orderPromoLabel})` : '';
    parts.push(`Descuento del pedido${hint}: -${formatMoney(orderDiscount, currency)}`);
  }

  if (deliveryFee > 0) {
    parts.push(`Envío: ${formatMoney(deliveryFee, currency)}`);
  }

  parts.push(bold(`TOTAL: ${formatMoney(grandTotal, currency)}`));

  return parts.join('\n');
}

export function whatsappPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildWhatsAppOrderUrl(phone: string, message: string): string {
  const digits = whatsappPhoneDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Opens WhatsApp in a new tab without navigating the current page. */
export function openWhatsAppOrder(phone: string, message: string): void {
  const url = buildWhatsAppOrderUrl(phone, message);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
