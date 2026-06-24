import type { CartQuote } from '@/lib/api/public';
import type { Product, Promotion } from '@/lib/api/types';
import {
  buildCheckoutLineBreakdowns,
  promotionDisplayName,
} from '@/lib/digital-menu/cart/buildCheckoutLineBreakdown';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { formatMoney } from '@/lib/currency';
import {
  PAYMENT_METHOD_LABELS,
} from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';
import type { CheckoutFulfillment } from './fulfillment';

export type WhatsAppOrderMessageInput = {
  restaurantName: string;
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
    restaurantName,
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
    '',
    `${bold('Cliente:')} ${fulfillment.customerName.trim()}`,
    `${bold('Teléfono:')} ${fulfillment.customerPhone.trim()}`,
    '',
    `${bold('Tipo de pedido:')} ${RESTAURANT_SERVICE_LABELS[fulfillment.serviceType]}`,
  ];

  if (fulfillment.serviceType === 'delivery') {
    parts.push(`${bold('Dirección:')} ${fulfillment.deliveryAddress.trim()}`);
  }

  if (fulfillment.paymentMethod) {
    parts.push(`${bold('Método de pago:')} ${PAYMENT_METHOD_LABELS[fulfillment.paymentMethod]}`);
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

    if (breakdown.discountCents > 0) {
      const promoHint = breakdown.promoLabel ? ` (${breakdown.promoLabel})` : '';
      parts.push(
        `   Promo${promoHint}: -${formatMoney(breakdown.discountCents / 100, currency)}`,
      );
    }

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
