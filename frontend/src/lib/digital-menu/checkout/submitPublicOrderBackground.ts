import type { PublicOrderInput } from '@/lib/api/public';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

export function submitPublicOrderBackground(
  subdomain: string,
  payload: PublicOrderInput,
  idempotencyKey: string,
): void {
  if (typeof window === 'undefined') return;

  const url = `${API_URL}/public/menu/${encodeURIComponent(subdomain)}/orders`;

  void fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((error) => {
    console.warn('[checkout] Background order save failed:', error);
  });
}
