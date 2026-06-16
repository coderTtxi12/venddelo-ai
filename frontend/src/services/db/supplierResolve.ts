import { listRestaurants } from '@/lib/api/restaurants';
import type { LegacyDbClient } from '../legacyDb';

export type ResolveSupplierResult = { supplierId: string } | { error: string };

export async function resolveSupplierIdByEmail(
  _db: LegacyDbClient,
  _email: string,
  accessToken: string | null,
): Promise<ResolveSupplierResult> {
  if (!accessToken) {
    return { error: 'No hay sesión activa. Inicia sesión de nuevo.' };
  }

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
    console.error(error);
    return { error: 'No se pudo cargar tu restaurante. Verifica que el backend esté en marcha.' };
  }
}
