'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { AppUser } from '@/types/auth';

interface AuthContextValue {
  user: AppUser | null;
  /** Alias para componentes migrados desde Firebase. */
  firebaseUser: AppUser | null;
  loading: boolean;
  loginRejectionMessage: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSessionUser(session: Session): AppUser {
  const u = session.user;
  const meta = u.user_metadata ?? {};
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName:
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      null,
    photoURL:
      (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
      (typeof meta.picture === 'string' && meta.picture) ||
      null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = useMemo<SupabaseClient>(() => createClient(), []);
  const [user, setUser] = useState<AppUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginRejectionMessage, setLoginRejectionMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setUser(mapSessionUser(data.session));
        setAccessToken(data.session.access_token);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setUser(mapSessionUser(session));
        setAccessToken(session.access_token);
        setLoginRejectionMessage(null);
      } else {
        setUser(null);
        setAccessToken(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const loginWithGoogle = async () => {
    setLoginRejectionMessage(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      console.error(error);
      setLoginRejectionMessage(
        'No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.',
      );
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
    router.replace('/login');
    router.refresh();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser: user,
        loading,
        loginRejectionMessage,
        loginWithGoogle,
        logout,
        accessToken,
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
