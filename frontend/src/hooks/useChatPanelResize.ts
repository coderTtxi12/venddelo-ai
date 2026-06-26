'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampChatPanelWidth,
  DEFAULT_CHAT_PANEL_WIDTH,
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  persistChatPanelWidth,
  readStoredChatPanelWidth,
} from '@/lib/assistant/chatPanelWidth';

const KEYBOARD_STEP_PX = 16;

export function useChatPanelResize(enabled: boolean) {
  const [width, setWidth] = useState(DEFAULT_CHAT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    setWidth(readStoredChatPanelWidth());
  }, []);

  widthRef.current = width;

  const applyWidth = useCallback((nextWidth: number, persist = false) => {
    const clamped = clampChatPanelWidth(nextWidth);
    setWidth(clamped);
    if (persist) persistChatPanelWidth(clamped);
  }, []);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!enabled) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        applyWidth(startWidth + delta);
      };

      const finishResize = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        persistChatPanelWidth(widthRef.current);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', finishResize);
        window.removeEventListener('pointercancel', finishResize);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finishResize);
      window.addEventListener('pointercancel', finishResize);
    },
    [applyWidth, enabled],
  );

  const onResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!enabled) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applyWidth(widthRef.current - KEYBOARD_STEP_PX, true);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        applyWidth(widthRef.current + KEYBOARD_STEP_PX, true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        applyWidth(MIN_CHAT_PANEL_WIDTH, true);
      } else if (event.key === 'End') {
        event.preventDefault();
        applyWidth(MAX_CHAT_PANEL_WIDTH, true);
      }
    },
    [applyWidth, enabled],
  );

  return {
    width,
    isResizing,
    onResizePointerDown,
    onResizeKeyDown,
  };
}
