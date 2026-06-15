import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

/** Completa el flujo OAuth PKCE de Supabase (sin cambiar UI del login). */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error(error);
          if (!cancelled) navigate('/login', { replace: true });
          return;
        }
      } else {
        await supabase.auth.getSession();
      }

      if (!cancelled) navigate('/', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <p style={{ color: 'var(--color-text-secondary)' }}>Completando inicio de sesión…</p>
    </div>
  );
}
