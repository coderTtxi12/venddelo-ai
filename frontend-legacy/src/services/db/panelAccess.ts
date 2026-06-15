import type { LegacyDbClient } from '../legacyDb';

export type PanelAccessDenyReason = 'no_email' | 'not_found' | 'wrong_role';

export type PanelAccessResult =
  | { allowed: true; firestoreUserId: string; role: string }
  | { allowed: false; reason: PanelAccessDenyReason };

/** Sin Firebase: el acceso se valida con Supabase Auth + backend en fases posteriores. */
export async function verifyPanelUserAccess(
  _db: LegacyDbClient,
  email: string | null | undefined,
): Promise<PanelAccessResult> {
  const emailLower = email?.trim().toLowerCase() ?? '';
  if (!emailLower) return { allowed: false, reason: 'no_email' };
  return { allowed: true, firestoreUserId: emailLower, role: 'owner' };
}
