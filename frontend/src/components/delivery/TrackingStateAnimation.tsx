'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';
import type { TrackingAnimationState } from '@/lib/dispatch/trackingAnimationSamples';
import styles from './TrackingAnimationShowcase.module.css';

gsap.registerPlugin(useGSAP);

type TrackingStateAnimationProps = {
  state: TrackingAnimationState;
  playing: boolean;
};

function pauseOnHidden(animations: gsap.core.Animation[]) {
  const onVisibility = () => {
    animations.forEach((animation) => {
      if (document.hidden) {
        animation.pause();
      } else {
        animation.resume();
      }
    });
  };

  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}

function AcceptedScene() {
  return (
    <svg className={styles.animationSvg} viewBox="0 0 240 190" aria-hidden="true" focusable="false">
      <g data-bell className={styles.bellGroup}>
        <circle cx="120" cy="46" r="6" className={styles.bellRing} />
        <path className={styles.bellHandle} d="M120 52v10" />
        <path
          className={styles.bellBody}
          d="M94 78c0-18 11.5-30 26-30s26 12 26 30v22c10 4 12 14 12 14H82s2-10 12-14Z"
        />
        <path className={styles.bellLip} d="M80 114h80" />
        <circle data-clapper cx="120" cy="126" r="7" className={styles.bellClapper} />
      </g>
    </svg>
  );
}

function PreparingScene() {
  return (
    <svg className={styles.animationSvg} viewBox="0 0 240 190" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="hourglass-sand">
          <path d="M92 48h56L124 90h-8L92 48Z" />
          <path d="M116 90h8L148 142H92L116 90Z" />
        </clipPath>
      </defs>
      <path className={styles.glassFrame} d="M86 42h68M86 148h68M90 42 98 148M150 42l-8 106" />
      <path className={styles.glassBulb} d="M92 48h56L120 92 92 48Z" />
      <path className={styles.glassBulb} d="M120 98 148 142H92L120 98Z" />
      <g clipPath="url(#hourglass-sand)">
        <circle data-grain cx="114" cy="58" r="3.2" className={styles.sandGrain} />
        <circle data-grain cx="120" cy="52" r="2.8" className={styles.sandGrain} />
        <circle data-grain cx="126" cy="60" r="3" className={styles.sandGrain} />
        <circle data-grain cx="118" cy="64" r="2.6" className={styles.sandGrain} />
        <circle data-grain cx="123" cy="55" r="2.4" className={styles.sandGrain} />
      </g>
    </svg>
  );
}

function SearchingScene() {
  return (
    <div className={styles.radarDisc} data-radar>
      <span className={`${styles.radarRing} ${styles.radarRingOuter}`} />
      <span className={`${styles.radarRing} ${styles.radarRingInner}`} />
      <span className={styles.radarSweep} data-sweep />
      <span className={styles.radarRider} data-rider style={{ top: '28%', left: '64%' }} />
      <span className={styles.radarRider} data-rider style={{ top: '46%', left: '32%' }} />
      <span className={styles.radarRider} data-rider style={{ top: '68%', left: '58%' }} />
      <span className={styles.radarRider} data-rider style={{ top: '38%', left: '48%' }} />
      <span className={styles.radarHub} />
    </div>
  );
}

export function TrackingStateAnimation({ state, playing }: TrackingStateAnimationProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const animate = playing && !reduceMotion;

      if (state === 'accepted') {
        const bell = root.querySelector('[data-bell]');
        const clapper = root.querySelector('[data-clapper]');
        if (!bell || !clapper) {
          return;
        }

        gsap.set(bell, {
          rotation: animate ? -11 : 0,
          transformOrigin: '120px 46px',
          svgOrigin: '120 46',
        });
        gsap.set(clapper, { x: animate ? -5 : 0 });
        if (!animate) {
          return;
        }

        const swing = gsap.to(bell, {
          rotation: 11,
          duration: 1.15,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
        const clapperSwing = gsap.to(clapper, {
          x: 5,
          duration: 1.15,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });

        return pauseOnHidden([swing, clapperSwing]);
      }

      if (state === 'scheduled') {
        const grains = gsap.utils.toArray<SVGCircleElement>('[data-grain]', root);
        gsap.set(grains, { y: 0, x: 0, opacity: animate ? 0 : 0.85 });
        if (!animate) {
          return;
        }

        const grainTweens = grains.map((grain, index) => {
          const pullX = 120 - Number(grain.getAttribute('cx'));
          return gsap.to(grain, {
            keyframes: [
              { y: 0, x: 0, opacity: 0, duration: 0.01 },
              { y: 16, x: pullX * 0.4, opacity: 0.95, duration: 0.28 },
              { y: 40, x: pullX, opacity: 0.95, duration: 0.42 },
              { y: 86, x: pullX * 0.25, opacity: 0, duration: 0.7 },
            ],
            ease: 'none',
            repeat: -1,
            delay: index * 0.36,
          });
        });

        return pauseOnHidden(grainTweens);
      }

      const sweep = root.querySelector('[data-sweep]');
      const riders = gsap.utils.toArray<HTMLElement>('[data-rider]', root);
      if (!sweep) {
        return;
      }

      gsap.set(sweep, { rotation: animate ? 0 : 42, transformOrigin: '50% 50%' });
      gsap.set(riders, { opacity: animate ? 0.4 : 0.9, scale: 1, x: 0, y: 0, transformOrigin: '50% 50%' });
      if (!animate) {
        return;
      }

      const spin = gsap.to(sweep, {
        rotation: '+=360',
        duration: 3.2,
        ease: 'none',
        repeat: -1,
      });
      const riderTweens = riders.flatMap((rider, index) => [
        gsap.to(rider, {
          opacity: 1,
          scale: 1.22,
          duration: 1.05 + index * 0.08,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: index * 0.24,
        }),
        gsap.to(rider, {
          x: index % 2 === 0 ? 5 : -5,
          y: index % 2 === 0 ? -4 : 4,
          duration: 2.4 + index * 0.18,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      ]);

      return pauseOnHidden([spin, ...riderTweens]);
    },
    { scope: rootRef, dependencies: [state, playing] },
  );

  return (
    <div ref={rootRef} className={styles.animationFrame} data-state={state}>
      {state === 'accepted' ? <AcceptedScene /> : null}
      {state === 'scheduled' ? <PreparingScene /> : null}
      {state === 'searching' ? <SearchingScene /> : null}
    </div>
  );
}
