import { type ReactNode } from 'react';

type ChatMessageLinkProps = {
  href: string;
  children: ReactNode;
};

export function normalizeChatHref(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
}

export function ChatMessageLink({ href, children }: ChatMessageLinkProps) {
  return (
    <a
      href={normalizeChatHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}
