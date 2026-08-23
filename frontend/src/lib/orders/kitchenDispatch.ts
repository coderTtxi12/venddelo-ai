import type { Order } from '@/lib/api/types';
import { buildOrderTotalsBreakdown } from '@/lib/orders/orderDisplay';
import { parseE164Phone } from '@/lib/phone/parseE164';

const REFERENCES_MARKER = '\nReferencias:';

export type KitchenDispatchFormValues = {
  customerName: string;
  phoneCountryIso: string;
  phoneLocal: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  addressReferences: string;
  paymentMethod: Order['payment_method'];
  collectAmount: string;
  cashDenomination: string;
};

export function splitDeliveryAddress(raw: string | null): {
  address: string;
  references: string;
} {
  const text = raw?.trim() ?? '';
  const index = text.indexOf(REFERENCES_MARKER);
  if (index === -1) {
    return { address: text, references: '' };
  }
  return {
    address: text.slice(0, index).trim(),
    references: text.slice(index + REFERENCES_MARKER.length).trim(),
  };
}

export function centsToPesosInput(cents: number): string {
  return String(cents / 100);
}

export function orderToDispatchFormValues(order: Order): KitchenDispatchFormValues {
  const { address, references } = splitDeliveryAddress(order.delivery_address);
  const phone = parseE164Phone(order.customer_phone);
  const breakdown = buildOrderTotalsBreakdown(order);
  return {
    customerName: order.customer_name,
    phoneCountryIso: phone.countryIso,
    phoneLocal: phone.localNumber,
    address,
    latitude: order.delivery_latitude,
    longitude: order.delivery_longitude,
    addressReferences: references,
    paymentMethod: order.payment_method,
    collectAmount: centsToPesosInput(breakdown.totalCents),
    cashDenomination:
      order.payment_method === 'cash' && order.cash_denomination_cents != null
        ? centsToPesosInput(order.cash_denomination_cents)
        : '',
  };
}

export function kitchenConfirmOpensDispatch(order: Order): boolean {
  return order.status === 'pending' && order.type === 'delivery';
}

export async function requestRiderThenConfirmOrder<TRequest, TOrder>(opts: {
  createDispatch: () => Promise<TRequest>;
  confirmOrder: () => Promise<TOrder>;
}): Promise<
  | { status: 'ok'; request: TRequest; order: TOrder }
  | { status: 'create_failed'; error: unknown }
  | { status: 'confirm_failed'; request: TRequest; error: unknown }
> {
  let request: TRequest;
  try {
    request = await opts.createDispatch();
  } catch (error) {
    return { status: 'create_failed', error };
  }
  try {
    const order = await opts.confirmOrder();
    return { status: 'ok', request, order };
  } catch (error) {
    return { status: 'confirm_failed', request, error };
  }
}
