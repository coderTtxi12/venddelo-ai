import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, db, googleProvider } from '../services/firebase';
import { logAuditEventSafe, verifyPanelUserAccess } from '../services/db';

/** Mensaje cuando el usuario de Google no tiene acceso activo en `suppliers`. */
export const PANEL_ACCESS_DENIED_MESSAGE =
  'No tienes permisos para acceder. Tu cuenta no tiene acceso activo en proveedores.';

const VERIFY_ERROR_MESSAGE =
  'No pudimos verificar tu acceso. Revisa tu conexión e inténtalo de nuevo en unos minutos.';

interface AuthContextValue {
  /**
   * Usuario con acceso al panel (misma referencia que Firebase `User` tras validar Firestore).
   * Null si no hay sesión o aún no pasó la verificación / fue rechazada.
   */
  user: User | null;
  /**
   * Sesión de Firebase Auth (puede existir mientras `user` sigue null durante la verificación).
   */
  firebaseUser: User | null;
  /**
   * True hasta el primer callback de `onAuthStateChanged`.
   */
  loading: boolean;
  /** True mientras se comprueba en Firestore el acceso al panel. */
  isCheckingPanelAccess: boolean;
  loginRejectionMessage: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCheckingPanelAccess, setIsCheckingPanelAccess] = useState(false);
  const [loginRejectionMessage, setLoginRejectionMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      void (async () => {
        setLoading(false);
        setFirebaseUser(fbUser);

        if (!fbUser) {
          if (!cancelledRef.current) {
            setUser(null);
            setIsCheckingPanelAccess(false);
          }
          return;
        }

        if (!cancelledRef.current) {
          setUser(null);
          setIsCheckingPanelAccess(true);
        }

        try {
          const result = await verifyPanelUserAccess(db, fbUser.email);

          if (cancelledRef.current) return;

          if (!result.allowed) {
            await logAuditEventSafe(db, {
              action: 'login',
              actor: {
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: fbUser.displayName,
              },
              target: {
                collectionId: 'panel_access',
                documentId: fbUser.uid,
              },
              summary: 'Intento de acceso al panel denegado',
              metadata: {
                outcome: 'denied',
                reason: result.reason,
                authEmail: fbUser.email?.toLowerCase() ?? null,
              },
            });

            setLoginRejectionMessage(PANEL_ACCESS_DENIED_MESSAGE);
            await signOut(auth);
            return;
          }

          await logAuditEventSafe(db, {
            action: 'login',
            actor: {
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName,
            },
            target: {
              collectionId: 'suppliers',
              documentId: result.firestoreUserId,
            },
            summary: 'Acceso al panel concedido',
            metadata: {
              outcome: 'allowed',
              role: result.role,
              authUid: fbUser.uid,
            },
          });

          if (!cancelledRef.current) {
            setUser(fbUser);
            setLoginRejectionMessage(null);
          }
        } catch (err) {
          console.error(err);
          if (!cancelledRef.current) {
            await logAuditEventSafe(db, {
              action: 'login',
              actor: {
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: fbUser.displayName,
              },
              target: {
                collectionId: 'panel_access',
                documentId: fbUser.uid,
              },
              summary: 'Error al verificar acceso al panel',
              metadata: {
                outcome: 'error',
                message: err instanceof Error ? err.message : String(err),
              },
            });
            setLoginRejectionMessage(VERIFY_ERROR_MESSAGE);
            await signOut(auth);
          }
        } finally {
          if (!cancelledRef.current) setIsCheckingPanelAccess(false);
        }
      })();
    });

    return () => {
      cancelledRef.current = true;
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoginRejectionMessage(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const code =
        typeof e === 'object' && e !== null && 'code' in e
          ? String((e as { code: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error(e);
      setLoginRejectionMessage(
        'No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.'
      );
    }
  };

  const logout = async () => {
    const u = auth.currentUser;
    if (u) {
      await logAuditEventSafe(db, {
        action: 'logout',
        actor: {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
        },
        target: {
          collectionId: 'panel_access',
          documentId: u.uid,
        },
        summary: 'Cierre de sesión en el panel',
        metadata: { outcome: 'logout' },
      });
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        isCheckingPanelAccess,
        loginRejectionMessage,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
