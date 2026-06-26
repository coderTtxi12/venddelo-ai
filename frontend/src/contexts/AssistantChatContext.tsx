'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AssistantChatContextValue = {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
};

const AssistantChatContext = createContext<AssistantChatContextValue | null>(null);

export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({ isOpen, openChat, closeChat, toggleChat }),
    [isOpen, openChat, closeChat, toggleChat],
  );

  return <AssistantChatContext.Provider value={value}>{children}</AssistantChatContext.Provider>;
}

export function useAssistantChat(): AssistantChatContextValue {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) {
    throw new Error('useAssistantChat must be used within AssistantChatProvider');
  }
  return ctx;
}
