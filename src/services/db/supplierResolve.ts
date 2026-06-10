import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';

export type ResolveSupplierResult =
  | { supplierId: string }
  | { error: string };

export async function resolveSupplierIdByEmail(db: Firestore, email: string): Promise<ResolveSupplierResult> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) {
    return { error: 'No se pudo detectar tu correo de sesión.' };
  }
  try {
    const q = query(
      collection(db, 'suppliers'),
      where('email', '==', emailLower),
      where('access', '==', true),
      limit(1)
    );
    const snap = await getDocs(q);
    const docSnap = snap.docs[0];
    if (!docSnap) {
      return {
        error: 'No se encontró tu proveedor en Firestore (suppliers) o no tiene access habilitado.',
      };
    }
    return { supplierId: docSnap.id };
  } catch (e) {
    console.error(e);
    return { error: 'No se pudo verificar tu supplierId. Intenta de nuevo.' };
  }
}
