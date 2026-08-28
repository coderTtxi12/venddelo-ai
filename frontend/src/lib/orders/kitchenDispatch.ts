import type { DispatchRequest } from '@/lib/api/dispatch';
import type { Order } from '@/lib/api/types';
import { buildOrderTotalsBreakdown } from '@/lib/orders/orderDisplay';
import { parseE164Phone } from '@/lib/phone/parseE164';

const REFERENCES_MARKER = '\nReferencias:';
const COORD_EPS = 1e-5;

export type KitchenDispatchLocation = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

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

function normalizeDispatchAddress(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function kitchenDispatchLocationChanged(
  original: KitchenDispatchLocation,
  current: KitchenDispatchLocation,
): boolean {
  if (normalizeDispatchAddress(original.address) !== normalizeDispatchAddress(current.address)) {
    return true;
  }
  if (original.latitude == null || original.longitude == null) return true;
  if (current.latitude == null || current.longitude == null) return true;
  return (
    Math.abs(original.latitude - current.latitude) > COORD_EPS ||
    Math.abs(original.longitude - current.longitude) > COORD_EPS
  );
}

export function orderWithDispatch(
  order: Order,
  request: Pick<DispatchRequest, 'tracking_token' | 'short_id' | 'status'>,
): Order {
  return {
    ...order,
    dispatch: {
      tracking_token: request.tracking_token,
      short_id: request.short_id,
      status: request.status,
    },
  };
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
