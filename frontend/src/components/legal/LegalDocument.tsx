import { EB_Garamond, Lato } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './LegalDocument.module.css';

const display = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-legal-display',
  weight: ['500', '600', '700'],
});

const body = Lato({
  subsets: ['latin'],
  variable: '--font-legal-body',
  weight: ['400', '700'],
});

export type LegalPath =
  | '/terminos'
  | '/privacidad'
  | '/rider/terminos'
  | '/rider/privacidad';

type LegalDocumentProps = {
  title: string;
  lastUpdated: string;
  currentPath: LegalPath;
  children: ReactNode;
};

function isRiderPath(path: LegalPath): boolean {
  return path.startsWith('/rider/');
}

export default function LegalDocument({
  title,
  lastUpdated,
  currentPath,
  children,
}: LegalDocumentProps) {
  const rider = isRiderPath(currentPath);
  const termsHref = rider ? '/rider/terminos' : '/terminos';
  const privacyHref = rider ? '/rider/privacidad' : '/privacidad';
  const brandHref = rider ? '/rider/privacidad' : '/';
  const brandLabel = rider ? 'Mexy Rider' : 'Mexy AI';

  return (
    <div className={`${styles.page} ${display.variable} ${body.variable}`}>
      <header className={styles.topBar}>
        <Link href={brandHref} className={styles.brand}>
          {brandLabel}
        </Link>
        <nav className={styles.nav} aria-label="Documentos legales">
          <Link
            href={termsHref}
            className={currentPath === termsHref ? styles.navLinkActive : styles.navLink}
            aria-current={currentPath === termsHref ? 'page' : undefined}
          >
            Términos
          </Link>
          <Link
            href={privacyHref}
            className={currentPath === privacyHref ? styles.navLinkActive : styles.navLink}
            aria-current={currentPath === privacyHref ? 'page' : undefined}
          >
            Privacidad
          </Link>
          {!rider && (
            <Link href="/login" className={styles.navCta}>
              Entrar
            </Link>
          )}
        </nav>
      </header>

      <main className={styles.main}>
        <article className={styles.article}>
          <p className={styles.kicker}>Documento legal</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Última actualización: {lastUpdated}</p>
          <div className={styles.content}>{children}</div>
        </article>
      </main>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Mexy AI. Todos los derechos reservados.</p>
        <div className={styles.footerLinks}>
          <Link href={termsHref}>Términos y Condiciones</Link>
          <Link href={privacyHref}>Política de Privacidad</Link>
        </div>
      </footer>
    </div>
  );
}
