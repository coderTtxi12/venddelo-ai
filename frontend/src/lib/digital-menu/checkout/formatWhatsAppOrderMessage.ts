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
import {
  buildGoogleMapsDeliveryUrl,
  buildGoogleMapsRestaurantUrl,
  type RestaurantMapLocation,
} from './buildGoogleMapsDeliveryUrl';
import type { CheckoutFulfillment } from './fulfillment';
import { formatCheckoutOrderIdLabel } from './createCheckoutOrderRef';

export type WhatsAppRestaurantLocation = RestaurantMapLocation;

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

function providerDeliveryFeeCentsForQuote(
  fulfillment: CheckoutFulfillment,
  quote: CartQuote,
): number {
  if (fulfillment.serviceType !== 'delivery') return 0;
  return quote.delivery_fee_cents ?? fulfillment.deliveryFeeCents ?? 0;
}

function quoteWaivedDeliveryCents(quote: CartQuote): number {
  return Math.max(
    quote.waived_delivery_cents ?? 0,
    quote.coupon?.waived_delivery_cents ?? 0,
  );
}

function customerDeliveryFeeCentsForQuote(
  fulfillment: CheckoutFulfillment,
  quote: CartQuote,
): number {
  const fee = providerDeliveryFeeCentsForQuote(fulfillment, quote);
  const waived = quoteWaivedDeliveryCents(quote);
  return Math.max(0, fee - waived);
}

function isCouponDeliveryWaived(quote: CartQuote): boolean {
  const coupon = quote.coupon;
  if (!coupon) return false;
  return coupon.type === 'free_shipping' || coupon.waived_delivery_cents > 0;
}

function isPromoDeliveryWaived(quote: CartQuote): boolean {
  return (
    Boolean(quote.applied_free_shipping_promotion_id) ||
    (quote.waived_delivery_cents ?? 0) > 0
  );
}

export function formatQuotePromotionWhatsAppLines(
  promotion: Promotion | undefined,
  currency: string,
): string[] {
  if (!promotion) return [];
  if (promotion.type === 'free_shipping' || promotion.type === 'combo') {
    const isComboFreeShipping =
      promotion.type === 'combo' &&
      promotion.percent == null &&
      promotion.amount_cents == null;
    if (promotion.type === 'free_shipping' || isComboFreeShipping) {
      return [`Promoción ${promotionDisplayName(promotion)}: Envío gratis`];
    }
  }
  return [];
}

export function formatQuoteCouponWhatsAppLines(
  coupon: CartQuote['coupon'],
  currency: string,
): string[] {
  if (!coupon) return [];
  if (coupon.discount_cents > 0) {
    return [`Cupón ${coupon.code}: -${formatMoney(coupon.discount_cents / 100, currency)}`];
  }
  if (coupon.type === 'free_shipping' || coupon.waived_delivery_cents > 0) {
    return [`Cupón ${coupon.code}: Envío gratis`];
  }
  return [`Cupón ${coupon.code}`];
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
  const freeShippingPromo = quote.applied_free_shipping_promotion_id
    ? promotionsById.get(quote.applied_free_shipping_promotion_id)
    : undefined;
  const deliveryFeeCents = customerDeliveryFeeCentsForQuote(fulfillment, quote);
  const deliveryFee = deliveryFeeCents / 100;
  const deliveryFeeWaived = isPromoDeliveryWaived(quote) || isCouponDeliveryWaived(quote);
  const grandTotal = (quote.total_cents + deliveryFeeCents) / 100;
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

  const deliveryMapsUrl =
    fulfillment.serviceType === 'delivery' ? buildGoogleMapsDeliveryUrl(fulfillment) : null;
  const restaurantMapsUrl =
    fulfillment.serviceType === 'delivery' || fulfillment.serviceType === 'takeout'
      ? buildGoogleMapsRestaurantUrl(restaurantLocation)
      : null;

  if (restaurantMapsUrl) {
    parts.push(
      '',
      '——————————————',
      bold('Ubicación del restaurante (recolección)'),
      restaurantMapsUrl,
      '——————————————',
    );
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

  parts.push(...formatQuotePromotionWhatsAppLines(freeShippingPromo, currency));
  parts.push(...formatQuoteCouponWhatsAppLines(quote.coupon, currency));

  if (fulfillment.serviceType === 'delivery' && (deliveryFee > 0 || deliveryFeeWaived)) {
    parts.push(
      deliveryFeeWaived
        ? `Envío: Gratis`
        : `Envío: ${formatMoney(deliveryFee, currency)}`,
    );
  }

  parts.push(bold(`TOTAL: ${formatMoney(grandTotal, currency)}`));
  parts.push('——————————————');

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

  if (fulfillment.serviceType === 'delivery') {
    parts.push(
      '',
      '——————————————',
      `${bold('Dirección de entrega:')} ${fulfillment.deliveryAddress.trim()}`,
    );
    const details = fulfillment.deliveryAddressDetails.trim();
    if (details) {
      parts.push('', `${bold('Referencias:')} ${details}`);
    }

    if (deliveryMapsUrl) {
      parts.push(
        '',
        '——————————————',
        bold('Ubicación de entrega (cliente)'),
        deliveryMapsUrl,
        '——————————————',
      );
    }
  }

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
