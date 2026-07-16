'use client';

import { useEffect } from 'react';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { consumeOpenAssistantAfterOnboarding } from '@/lib/onboarding/storage';

export function useOpenAssistantAfterOnboarding() {
  const { openChat } = useAssistantChat();

  useEffect(() => {
    if (consumeOpenAssistantAfterOnboarding()) {
      openChat();
    }
  }, [openChat]);
}
