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

type LegalDocumentProps = {
  title: string;
  lastUpdated: string;
  currentPath: '/terminos' | '/privacidad';
  children: ReactNode;
};

export default function LegalDocument({
  title,
  lastUpdated,
  currentPath,
  children,
}: LegalDocumentProps) {
  return (
    <div className={`${styles.page} ${display.variable} ${body.variable}`}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          Mexy AI
        </Link>
        <nav className={styles.nav} aria-label="Documentos legales">
          <Link
            href="/terminos"
            className={currentPath === '/terminos' ? styles.navLinkActive : styles.navLink}
            aria-current={currentPath === '/terminos' ? 'page' : undefined}
          >
            Términos
          </Link>
          <Link
            href="/privacidad"
            className={currentPath === '/privacidad' ? styles.navLinkActive : styles.navLink}
            aria-current={currentPath === '/privacidad' ? 'page' : undefined}
          >
            Privacidad
          </Link>
          <Link href="/login" className={styles.navCta}>
            Entrar
          </Link>
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
          <Link href="/terminos">Términos y Condiciones</Link>
          <Link href="/privacidad">Política de Privacidad</Link>
        </div>
      </footer>
    </div>
  );
}
