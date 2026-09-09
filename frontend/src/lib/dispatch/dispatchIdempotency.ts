import type { DispatchCreateInput } from '@/lib/api/dispatch';

export type PendingDispatchIdempotency = {
  fingerprint: string;
  key: string;
};

export function dispatchAttemptFingerprint(
  restaurantId: string,
  input: DispatchCreateInput,
): string {
  return JSON.stringify({ restaurantId, ...input });
}

export function createDispatchIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Reuse the same Idempotency-Key until the request payload changes. */
export function resolveDispatchIdempotency(
  fingerprint: string,
  pending: PendingDispatchIdempotency | null,
): PendingDispatchIdempotency {
  if (pending && pending.fingerprint === fingerprint) {
    return pending;
  }
  return { fingerprint, key: createDispatchIdempotencyKey() };
}
