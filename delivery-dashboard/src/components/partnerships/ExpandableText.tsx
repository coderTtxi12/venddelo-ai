'use client';

import { useId, useState } from 'react';
import styles from './ExpandableText.module.css';

type ExpandableTextProps = {
  text: string;
  collapsedLines?: number;
};

export function ExpandableText({ text, collapsedLines = 3 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const trimmed = text.trim();
  if (!trimmed) return null;

  const likelyLong = trimmed.length > 160 || trimmed.split('\n').length > collapsedLines;

  return (
    <div className={styles.wrap}>
      <p
        id={contentId}
        className={`${styles.text} ${expanded ? styles.textExpanded : styles.textCollapsed}`}
        style={{ WebkitLineClamp: expanded ? undefined : collapsedLines }}
      >
        {trimmed}
      </p>
      {likelyLong ? (
        <button
          type="button"
          className={styles.toggleBtn}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  );
}
