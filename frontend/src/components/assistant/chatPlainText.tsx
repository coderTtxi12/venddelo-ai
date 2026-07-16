import { type ReactNode } from 'react';

import { ChatColorSwatch, isChatHexColor } from '@/components/assistant/chatColorSwatch';
import { ChatMessageLink } from '@/components/assistant/chatMessageLink';

/** Bare URLs, www. links, and hex color tokens in plain chat text. */
const ENRICH_PLAIN_TEXT_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<>\]\)]+|#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b)/gi;

const TRAILING_PUNCTUATION = /[.,;:!?)\]}>]+$/;

function splitTrailingPunctuation(token: string): { core: string; trailing: string } {
  let core = token;
  let trailing = '';
  while (TRAILING_PUNCTUATION.test(core)) {
    const match = TRAILING_PUNCTUATION.exec(core);
    if (!match) break;
    trailing = match[0] + trailing;
    core = core.slice(0, -match[0].length);
  }
  return { core, trailing };
}

function isUrlToken(token: string): boolean {
  return /^(?:https?:\/\/|www\.)/i.test(token);
}

export function enrichPlainText(text: string, keyPrefix: string, swatchClassName?: string): ReactNode[] {
  if (!text) return [];

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  ENRICH_PLAIN_TEXT_PATTERN.lastIndex = 0;
  while ((match = ENRICH_PLAIN_TEXT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const raw = match[0];
    const { core, trailing } = splitTrailingPunctuation(raw);
    const key = `${keyPrefix}-token-${partIndex}`;
    partIndex += 1;

    if (core && isUrlToken(core)) {
      nodes.push(
        <ChatMessageLink key={key} href={core}>
          {core}
        </ChatMessageLink>,
      );
    } else if (core && isChatHexColor(core)) {
      nodes.push(
        <ChatColorSwatch key={key} hex={core} className={swatchClassName} />,
      );
    } else {
      nodes.push(raw);
    }

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function linkifyPlainText(text: string, keyPrefix: string): ReactNode[] {
  return enrichPlainText(text, keyPrefix);
}
