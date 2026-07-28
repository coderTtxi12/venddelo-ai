import type { DigitalMenuThemeColors } from './types';

/** Full-screen overlay scrim based on the live menu background (`--dm-bg`). */
export function resolveOverlayScrim(colors: DigitalMenuThemeColors): string {
  return `color-mix(in srgb, ${colors.background} 94%, transparent)`;
}
