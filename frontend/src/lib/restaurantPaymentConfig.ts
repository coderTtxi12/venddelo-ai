import type { DeliveryProviderPaymentMethod, RestaurantPaymentMethod } from '@/lib/api/types';
import type { RestaurantServiceType } from '@/lib/restaurantServices';

export const PAYMENT_METHOD_ORDER = ['cash', 'transfer', 'card_terminal'] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_ORDER)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

export type PaymentMethodMatrix = Record<
  RestaurantServiceType,
  Record<PaymentMethodKey, boolean>
>;

export type PaymentMethodCreateInput = {
  method: PaymentMethodKey;
  service_type: RestaurantServiceType;
  enabled: boolean;
};

export function createDefaultPaymentMatrix(): PaymentMethodMatrix {
  return {
    takeout: { cash: true, transfer: true, card_terminal: true },
    delivery: { cash: true, transfer: true, card_terminal: true },
  };
}

export function paymentMethodsToMatrix(
  methods: RestaurantPaymentMethod[],
): PaymentMethodMatrix {
  const matrix = createDefaultPaymentMatrix();
  for (const entry of methods) {
    if (
      (entry.service_type === 'takeout' || entry.service_type === 'delivery') &&
      (entry.method === 'cash' || entry.method === 'transfer' || entry.method === 'card_terminal')
    ) {
      matrix[entry.service_type][entry.method] = entry.enabled;
    }
  }
  return matrix;
}

export function providerPaymentMethodsToDeliveryMatrix(
  methods: DeliveryProviderPaymentMethod[],
): PaymentMethodMatrix['delivery'] {
  const delivery: PaymentMethodMatrix['delivery'] = {
    cash: false,
    transfer: false,
    card_terminal: false,
  };
  for (const entry of methods) {
    if (entry.method === 'cash' || entry.method === 'transfer' || entry.method === 'card_terminal') {
      delivery[entry.method] = entry.enabled;
    }
  }
  return delivery;
}

/** Keep restaurant toggles only where the courier still offers the method. */
export function clampDeliveryMatrixToProviderAvailable(
  delivery: PaymentMethodMatrix['delivery'],
  providerAvailable: PaymentMethodMatrix['delivery'],
): PaymentMethodMatrix['delivery'] {
  return {
    cash: delivery.cash && providerAvailable.cash,
    transfer: delivery.transfer && providerAvailable.transfer,
    card_terminal: delivery.card_terminal && providerAvailable.card_terminal,
  };
}

export function matrixToPaymentCreates(
  matrix: PaymentMethodMatrix,
  options?: { serviceTypes?: RestaurantServiceType[] },
): PaymentMethodCreateInput[] {
  const serviceTypes = options?.serviceTypes ?? (['takeout', 'delivery'] as const);
  const rows: PaymentMethodCreateInput[] = [];
  for (const serviceType of serviceTypes) {
    for (const method of PAYMENT_METHOD_ORDER) {
      rows.push({
        method,
        service_type: serviceType,
        enabled: matrix[serviceType][method],
      });
    }
  }
  return rows;
}
