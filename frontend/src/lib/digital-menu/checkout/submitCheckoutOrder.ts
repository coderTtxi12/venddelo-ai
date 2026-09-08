import { createPublicOrder, type PublicOrderInput } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';

const NETWORK_ATTEMPTS = 2;

export type CreatePublicOrderFn = (
  subdomain: string,
  data: PublicOrderInput,
  idempotencyKey: string,
) => Promise<{ id: string }>;

export async function submitCheckoutOrder(
  subdomain: string,
  payload: PublicOrderInput,
  idempotencyKey: string,
  createOrder: CreatePublicOrderFn = createPublicOrder,
): Promise<{ id: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < NETWORK_ATTEMPTS; attempt += 1) {
    try {
      return await createOrder(subdomain, payload, idempotencyKey);
    } catch (error) {
      lastError = error;
      const canRetry = isCheckoutNetworkError(error) && attempt < NETWORK_ATTEMPTS - 1;
      if (!canRetry) throw error;
    }
  }

  throw lastError;
}

export function isCheckoutNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'network_error';
}

export function formatCheckoutSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') {
      return 'No se pudo registrar el pedido. Revisa tu conexión e intenta de nuevo.';
    }
    if (error.message.trim()) {
      return error.message;
    }
  }
  return 'No se pudo registrar el pedido. Intenta de nuevo.';
}
