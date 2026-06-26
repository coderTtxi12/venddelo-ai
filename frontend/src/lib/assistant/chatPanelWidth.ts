export const DEFAULT_CHAT_PANEL_WIDTH = 380;
export const MIN_CHAT_PANEL_WIDTH = 300;
export const MAX_CHAT_PANEL_WIDTH = 600;
export const CHAT_PANEL_WIDTH_STORAGE_KEY = 'venddelo:assistant-chat-width';

export function clampChatPanelWidth(width: number): number {
  return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, width));
}

export function readStoredChatPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PANEL_WIDTH;

  const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
  if (!raw) return DEFAULT_CHAT_PANEL_WIDTH;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CHAT_PANEL_WIDTH;

  return clampChatPanelWidth(parsed);
}

export function persistChatPanelWidth(width: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, String(clampChatPanelWidth(width)));
}
