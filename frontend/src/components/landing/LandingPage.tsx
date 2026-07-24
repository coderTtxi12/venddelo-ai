import Image from 'next/image';
import Link from 'next/link';
import ChatPromptDemo from './ChatPromptDemo';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.heroMedia} aria-hidden>
        <Image
          src="/assets/portada2.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
      </div>

      <header className={styles.topBar}>
        <p className={styles.brandMark}>Mexy AI</p>
        <Link href="/login" className={styles.navCta}>
          Entrar
        </Link>
      </header>

      <main className={styles.hero}>
        <div className={styles.copy}>
          <h1 className={styles.brand}>Mexy AI</h1>
          <p className={styles.headline}>Tu asistente AI para restaurantes.</p>
          <p className={styles.support}>
            Crea menús, carga productos y actualiza tu carta con una instrucción.
          </p>
        </div>

        <div className={styles.demo}>
          <ChatPromptDemo />
        </div>

        <div className={styles.actions}>
          <Link href="/login" className={styles.cta}>
            Empezar
          </Link>
        </div>
      </main>
    </div>
  );
}
