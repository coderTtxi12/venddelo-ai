export type CheckoutOrderRef = {
  /** Short human-readable id shown in WhatsApp and /orders (e.g. K7M2P). */
  orderId: string;
  /** Full idempotency key for the background API save. */
  idempotencyKey: string;
};

/** Same unambiguous alphabet as delivery dispatch short ids. */
export const CHECKOUT_ORDER_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CHECKOUT_ORDER_ID_LENGTH = 5;

function generateCheckoutOrderId(): string {
  const bytes = new Uint8Array(CHECKOUT_ORDER_ID_LENGTH);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(
    bytes,
    (value) => CHECKOUT_ORDER_ID_ALPHABET[value % CHECKOUT_ORDER_ID_ALPHABET.length],
  ).join('');
}

export function createCheckoutOrderRef(): CheckoutOrderRef {
  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return { orderId: generateCheckoutOrderId(), idempotencyKey };
}

export function formatCheckoutOrderIdLabel(orderId: string): string {
  return `#${orderId}`;
}
