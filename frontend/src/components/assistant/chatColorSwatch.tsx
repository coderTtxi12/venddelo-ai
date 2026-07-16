import { type CSSProperties } from 'react';

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function isChatHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

type ChatColorSwatchProps = {
  hex: string;
  className?: string;
};

/** Inline color preview for assistant chat (hex tokens). */
export function ChatColorSwatch({ hex, className }: ChatColorSwatchProps) {
  const normalized = hex.trim();
  const style = { background: normalized } satisfies CSSProperties;

  return (
    <span
      className={['chatColorSwatch', className].filter(Boolean).join(' ')}
      title={normalized}
      aria-label={`Color ${normalized}`}
    >
      <span className="chatColorSwatchDot" style={style} aria-hidden />
      <span className="chatColorSwatchHex">{normalized}</span>
    </span>
  );
}
