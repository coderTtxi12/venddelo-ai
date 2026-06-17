import { listRestaurants } from '@/lib/api/restaurants';
import { ApiError } from '@/lib/api/types';
import type { LegacyDbClient } from '../legacyDb';

export type ResolveSupplierResult = { supplierId: string } | { error: string };

const successCache = new Map<string, { supplierId: string }>();
const inflight = new Map<string, Promise<ResolveSupplierResult>>();

function cacheKey(accessToken: string, email: string): string {
  return `${accessToken}|${email}`;
}

async function fetchSupplierId(accessToken: string): Promise<ResolveSupplierResult> {
  try {
    const page = await listRestaurants(accessToken, 1);
    const restaurant = page.items[0];
    if (!restaurant) {
      return {
        error:
          'No tienes ningún restaurante asociado. Crea uno desde el onboarding para ver productos y categorías.',
      };
    }
    return { supplierId: restaurant.id };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'network_error') {
      return { error: error.message };
    }
    console.error(error);
    return { error: 'No se pudo cargar tu restaurante. Verifica que el backend esté en marcha.' };
  }
}

export async function resolveSupplierIdByEmail(
  _db: LegacyDbClient,
  email: string,
  accessToken: string | null,
): Promise<ResolveSupplierResult> {
  if (!accessToken) {
    return { error: 'No hay sesión activa. Inicia sesión de nuevo.' };
  }

  const key = cacheKey(accessToken, email);
  const cached = successCache.get(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchSupplierId(accessToken).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  const result = await pending;
  if ('supplierId' in result) {
    successCache.set(key, result);
  }
  return result;
}
