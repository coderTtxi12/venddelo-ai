import type { PublicOrderInput } from '@/lib/api/public';
import { selectionsToQuoteApi } from '@/lib/digital-menu/cart/cartQuotePayload';
import type { PublicMenuCartLine } from '@/lib/digital-menu/cart/types';
import type { CheckoutFulfillment } from './fulfillment';

export function buildPublicOrderInput(
  lines: PublicMenuCartLine[],
  fulfillment: CheckoutFulfillment,
): PublicOrderInput {
  const noteParts = lines
    .map((line) => {
      const trimmed = line.notes?.trim();
      if (!trimmed) return null;
      return `${line.productName}: ${trimmed}`;
    })
    .filter((entry): entry is string => entry != null);

  return {
    type: fulfillment.serviceType,
    customer_name: fulfillment.customerName.trim(),
    customer_phone: fulfillment.customerPhone.trim(),
    payment_method: fulfillment.paymentMethod!,
    delivery_address:
      fulfillment.serviceType === 'delivery'
        ? fulfillment.deliveryAddress.trim()
        : undefined,
    note: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
    items: lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      selected_options: selectionsToQuoteApi(line.selections),
    })),
  };
}
