'use client';

import { useAuth } from '@/hooks/useAuth';
import styles from './LoginPage.module.css';

function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={`${styles.logo} ${className ?? ''}`.trim()}>
      <span>Venddelo AI</span>
    </div>
  );
}

export default function LoginPage() {
  const { loginWithGoogle, loading, loginRejectionMessage } = useAuth();
  const busy = loading;

  return (
    <div className={styles.container}>
      <div className={styles.imagePanel}>
        <BrandLogo className={styles.logoLight} />
        <img src="/assets/portada2.jpg" alt="Venddelo AI" className={styles.coverImage} />
        <div className={styles.imageOverlay}>
          <p className={styles.quote}>
            &quot;La plataforma que necesitas para gestionar tu menú digital.&quot;
          </p>
          <span className={styles.author}>Venddelo AI Team</span>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formContent}>
          <h1 className={styles.title}>Bienvenido a Venddelo AI</h1>

          <p className={styles.subtitle}>
            Genera reportes, revisa tus estadísticas, agrega categorías, productos y mucho más
            desde un solo lugar.
          </p>

          {loginRejectionMessage && (
            <div className={styles.accessDenied} role="alert">
              {loginRejectionMessage}
            </div>
          )}

          <button
            type="button"
            className={styles.googleButton}
            onClick={() => void loginWithGoogle()}
            disabled={busy}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            {busy ? 'Verificando acceso…' : 'Continuar con Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
