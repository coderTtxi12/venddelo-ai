'use client';

import { useEffect, useState } from 'react';

const DEFAULT_CHAR_MS = 16;

function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useStreamingText(
  fullText: string,
  active: boolean,
  charMs: number = DEFAULT_CHAR_MS,
): { text: string; isComplete: boolean } {
  const [text, setText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!active) {
      setText('');
      setIsComplete(false);
      return;
    }

    if (getReducedMotion()) {
      setText(fullText);
      setIsComplete(true);
      return;
    }

    setText('');
    setIsComplete(false);

    let index = 0;
    const tick = () => {
      index += 1;
      setText(fullText.slice(0, index));
      if (index >= fullText.length) {
        setIsComplete(true);
        return;
      }
      timer = window.setTimeout(tick, charMs);
    };

    let timer = window.setTimeout(tick, charMs);
    return () => window.clearTimeout(timer);
  }, [fullText, active, charMs]);

  return { text, isComplete };
}
