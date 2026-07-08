import type { DigitalMenuTheme } from './types';

/** Muted surfaces for sold-out / unavailable UI — derived from the active menu theme. */
export function resolveUnavailableTokens(theme: DigitalMenuTheme): {
  noticeBg: string;
  noticeBorder: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  soldOutBg: string;
} {
  const { colors } = theme;

  return {
    noticeBg: `color-mix(in srgb, ${colors.textMuted} 10%, ${colors.surface})`,
    noticeBorder: `color-mix(in srgb, ${colors.border} 72%, ${colors.textMuted} 28%)`,
    badgeBg: `color-mix(in srgb, ${colors.textSecondary} 18%, ${colors.surface})`,
    badgeText: colors.textMuted,
    badgeBorder: `color-mix(in srgb, ${colors.border} 68%, ${colors.textMuted} 32%)`,
    soldOutBg: `color-mix(in srgb, ${colors.textMuted} 8%, ${colors.surface})`,
  };
}
