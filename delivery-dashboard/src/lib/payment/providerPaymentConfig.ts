export const PAYMENT_METHOD_ORDER = ['cash', 'transfer', 'card_terminal'] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_ORDER)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_terminal: 'Terminal',
};

export type PaymentMethodState = Record<PaymentMethodKey, boolean>;

export type PaymentMethodUpdateInput = {
  method: PaymentMethodKey;
  enabled: boolean;
};

export function createDefaultPaymentState(): PaymentMethodState {
  return {
    cash: true,
    transfer: true,
    card_terminal: true,
  };
}

export function paymentMethodsToState(
  methods: Array<{ method: string; enabled: boolean }>,
): PaymentMethodState {
  const state = createDefaultPaymentState();
  for (const entry of methods) {
    if (
      entry.method === 'cash' ||
      entry.method === 'transfer' ||
      entry.method === 'card_terminal'
    ) {
      state[entry.method] = entry.enabled;
    }
  }
  return state;
}

export function stateToPaymentUpdates(state: PaymentMethodState): PaymentMethodUpdateInput[] {
  return PAYMENT_METHOD_ORDER.map((method) => ({
    method,
    enabled: state[method],
  }));
}
