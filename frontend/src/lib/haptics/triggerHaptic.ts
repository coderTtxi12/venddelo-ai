export type HapticKind = 'selection' | 'success';

const PATTERNS: Record<HapticKind, number> = {
  selection: 12,
  success: 18,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Short device vibration when supported (Android Chrome). No-op on iOS / desktop. */
export function triggerHaptic(kind: HapticKind): void {
  if (prefersReducedMotion()) return;
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Blocked without user gesture or unsupported — ignore silently.
  }
}
