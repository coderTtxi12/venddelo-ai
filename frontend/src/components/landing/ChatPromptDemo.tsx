'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import styles from './ChatPromptDemo.module.css';

const PROMPTS = [
  'Crea mi menú digital',
  'Carga estos productos a mi menú',
  'Deshabilita este complemento en todos mis productos, ya que se me acabó el habanero',
] as const;

const TYPE_MS = 38;
const HOLD_MS = 2200;
const DELETE_MS = 18;
const GAP_MS = 480;

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

export default function ChatPromptDemo() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const [promptIndex, setPromptIndex] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (reducedMotion) {
      const timer = window.setInterval(() => {
        setPromptIndex((current) => (current + 1) % PROMPTS.length);
      }, 3200);
      return () => window.clearInterval(timer);
    }

    let cancelled = false;
    let timeoutId = 0;
    const prompt = PROMPTS[promptIndex % PROMPTS.length];

    const schedule = (fn: () => void, ms: number) => {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const typeAt = (index: number) => {
      if (index <= prompt.length) {
        setTyped(prompt.slice(0, index));
        schedule(() => typeAt(index + 1), TYPE_MS);
        return;
      }

      schedule(() => deleteAt(prompt.length), HOLD_MS);
    };

    const deleteAt = (index: number) => {
      if (index >= 0) {
        setTyped(prompt.slice(0, index));
        schedule(() => deleteAt(index - 1), DELETE_MS);
        return;
      }

      schedule(() => {
        setPromptIndex((current) => (current + 1) % PROMPTS.length);
      }, GAP_MS);
    };

    schedule(() => typeAt(0), GAP_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [promptIndex, reducedMotion]);

  const text = reducedMotion ? PROMPTS[promptIndex % PROMPTS.length] : typed;

  return (
    <div
      className={styles.shell}
      aria-live="polite"
      aria-label="Ejemplos de instrucciones al asistente"
    >
      <div className={styles.inputRow}>
        <div className={styles.input} role="textbox" aria-readonly="true">
          <span className={styles.typed}>{text}</span>
          <span className={styles.caret} aria-hidden />
        </div>
        <Link href="/login" className={styles.send} aria-label="Ir a iniciar sesión">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12h12M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
