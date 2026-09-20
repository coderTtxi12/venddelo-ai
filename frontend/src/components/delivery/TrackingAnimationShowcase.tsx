'use client';

import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useState } from 'react';
import { TRACKING_ANIMATION_SAMPLES } from '@/lib/dispatch/trackingAnimationSamples';
import { TrackingStateAnimation } from './TrackingStateAnimation';
import styles from './TrackingAnimationShowcase.module.css';

export function TrackingAnimationShowcase() {
  const [playing, setPlaying] = useState(true);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Mexy Delivery · Exploración visual</p>
          <h1>Animaciones para el rastreo</h1>
          <p className={styles.intro}>
            Tres momentos antes de mostrar el mapa. Diseñados primero para móvil y con el mismo
            lenguaje visual del enlace de rastreo.
          </p>
        </div>
        <button
          type="button"
          className={styles.motionControl}
          aria-pressed={playing}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? (
            <PauseRoundedIcon sx={{ fontSize: 20 }} aria-hidden />
          ) : (
            <PlayArrowRoundedIcon sx={{ fontSize: 20 }} aria-hidden />
          )}
          {playing ? 'Pausar' : 'Reproducir'}
        </button>
      </section>

      <section className={styles.gallery} aria-label="Muestras de animación">
        {TRACKING_ANIMATION_SAMPLES.map((sample, index) => (
          <article className={styles.sampleCard} key={sample.state} data-state={sample.state}>
            <div className={styles.sampleMeta}>
              <span className={styles.stepNumber} aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{sample.eyebrow}</span>
            </div>
            <TrackingStateAnimation state={sample.state} playing={playing} />
            <div className={styles.sampleCopy}>
              <div className={styles.statusRow}>
                <span className={styles.statusDot} aria-hidden />
                <span>En vivo</span>
              </div>
              <h2>{sample.title}</h2>
              <p>{sample.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <p className={styles.footnote}>
        El mapa aparecerá cuando haya un repartidor asignado y su ubicación aporte información
        útil al cliente.
      </p>
    </main>
  );
}
