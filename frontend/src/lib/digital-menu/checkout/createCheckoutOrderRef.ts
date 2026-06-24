export type CheckoutOrderRef = {
  /** Short human-readable id shown in WhatsApp (e.g. A1B2C3D4). */
  orderId: string;
  /** Full idempotency key for the background API save. */
  idempotencyKey: string;
};

export function createCheckoutOrderRef(): CheckoutOrderRef {
  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const orderId = idempotencyKey.replace(/-/g, '').slice(0, 8).toUpperCase();

  return { orderId, idempotencyKey };
}

export function formatCheckoutOrderIdLabel(orderId: string): string {
  return `#${orderId}`;
}
