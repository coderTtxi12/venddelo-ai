import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { withRetry } from './retry';

const SUPPLIERS_COLLECTION = 'suppliers';

export type PanelAccessDenyReason =
  | 'no_email'
  | 'not_found'
  | 'wrong_role';

export type PanelAccessResult =
  | { allowed: true; firestoreUserId: string; role: string }
  | { allowed: false; reason: PanelAccessDenyReason };

/**
 * Comprueba si el correo tiene un documento en `suppliers` con `access === true`.
 */
export async function verifyPanelUserAccess(
  db: Firestore,
  email: string | null | undefined
): Promise<PanelAccessResult> {
  const emailLower = email?.trim().toLowerCase() ?? '';
  if (!emailLower) {
    return { allowed: false, reason: 'no_email' };
  }

  return withRetry(async () => {
    const suppliersRef = collection(db, SUPPLIERS_COLLECTION);
    const q = query(
      suppliersRef,
      where('email', '==', emailLower),
      where('access', '==', true),
      limit(10)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { allowed: false, reason: 'not_found' };

    // Si hay más de uno por inconsistencia, tomamos el primero.
    const firstMatch = snapshot.docs[0]!;
    return {
      allowed: true,
      firestoreUserId: firstMatch.id,
      role: 'supplier',
    };
  }, 3);
}
