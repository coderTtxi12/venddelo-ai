import type { LegacyDbClient } from '../legacyDb';

export type ResolveSupplierResult = { supplierId: string } | { error: string };

const PENDING_BACKEND =
  'Los datos de proveedor se migrarán al API backend (Firebase desactivado).';

export async function resolveSupplierIdByEmail(
  _db: LegacyDbClient,
  email: string,
): Promise<ResolveSupplierResult> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) {
    return { error: 'No se pudo detectar tu correo de sesión.' };
  }
  return { error: PENDING_BACKEND };
}
