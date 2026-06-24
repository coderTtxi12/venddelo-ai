import type { PublicOrderInput } from '@/lib/api/public';
import { selectionsToQuoteApi } from '@/lib/digital-menu/cart/cartQuotePayload';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import { WHATSAPP_PENDING_CUSTOMER_PHONE, formatDeliveryAddressForOrder, type CheckoutFulfillment } from './fulfillment';
import { formatCheckoutOrderIdLabel } from './createCheckoutOrderRef';

export function buildPublicOrderInput(
  lines: PublicMenuCartLine[],
  fulfillment: CheckoutFulfillment,
  orderId?: string,
): PublicOrderInput {
  const noteParts: string[] = [];

  if (orderId) {
    noteParts.push(`Ref. pedido ${formatCheckoutOrderIdLabel(orderId)}`);
  }

  for (const line of lines) {
    const trimmed = line.notes?.trim();
    if (trimmed) {
      noteParts.push(`${line.productName}: ${trimmed}`);
    }
  }

  const deliveryAddress =
    fulfillment.serviceType === 'delivery'
      ? formatDeliveryAddressForOrder(fulfillment)
      : undefined;

  const deliveryFeeCents =
    fulfillment.serviceType === 'delivery' && fulfillment.deliveryFeeCents != null
      ? fulfillment.deliveryFeeCents
      : 0;

  return {
    type: fulfillment.serviceType,
    customer_name: fulfillment.customerName.trim(),
    customer_phone: WHATSAPP_PENDING_CUSTOMER_PHONE,
    payment_method: fulfillment.paymentMethod!,
    delivery_address: deliveryAddress,
    delivery_fee_cents: deliveryFeeCents > 0 ? deliveryFeeCents : undefined,
    note: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
    items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      selected_options: selectionsToQuoteApi(line.selections),
    })),
  };
}
