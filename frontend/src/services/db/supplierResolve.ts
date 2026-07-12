import {
  getStoredRestaurantId,
  resolveMyRestaurantAccess,
} from '@/lib/api/restaurants';
import { ApiError } from '@/lib/api/types';
import type { LegacyDbClient } from '../legacyDb';

export type ResolveSupplierResult = { supplierId: string } | { error: string };

const successCache = new Map<string, { supplierId: string }>();
const inflight = new Map<string, Promise<ResolveSupplierResult>>();

export function clearSupplierResolveCache(): void {
  successCache.clear();
  inflight.clear();
}

function cacheKey(accessToken: string, email: string, restaurantId?: string | null): string {
  return `${accessToken}|${email}|${restaurantId ?? ''}`;
}

async function fetchSupplierId(
  accessToken: string,
  email: string,
  userId?: string | null,
  restaurantId?: string | null,
): Promise<ResolveSupplierResult> {
  try {
    const preferredId = restaurantId ?? (userId ? getStoredRestaurantId(userId) : null);
    const response = await resolveMyRestaurantAccess(accessToken, {
      userId,
      restaurantId: preferredId,
    });
    if (response.restaurant) {
      return { supplierId: response.restaurant.id };
    }

    return {
      error:
        'No tienes ningún restaurante asociado. Completa el registro inicial para continuar.',
    };
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
  options?: { userId?: string | null; restaurantId?: string | null },
): Promise<ResolveSupplierResult> {
  if (!accessToken) {
    return { error: 'No hay sesión activa. Inicia sesión de nuevo.' };
  }

  const key = cacheKey(accessToken, email, options?.restaurantId);
  const cached = successCache.get(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchSupplierId(
      accessToken,
      email,
      options?.userId,
      options?.restaurantId,
    ).finally(() => {
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
