import type { DigitalMenuTheme } from './types';

/** Warm urgency hue (ui-ux-pro-max ecommerce / scarcity accent). */
export const LOW_STOCK_URGENCY_HUE = '#EA580C';
const URGENCY_TEXT_ON_LIGHT = '#C2410C';
const URGENCY_TEXT_ON_DARK = '#FB923C';

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const value = hex.trim();
  const long = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (long) {
    return {
      r: Number.parseInt(long[1], 16),
      g: Number.parseInt(long[2], 16),
      b: Number.parseInt(long[3], 16),
    };
  }
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(value);
  if (!short) return null;
  return {
    r: Number.parseInt(short[1] + short[1], 16),
    g: Number.parseInt(short[2] + short[2], 16),
    b: Number.parseInt(short[3] + short[3], 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Low-stock scarcity badge — warm urgency tint blended into the active theme surface
 * so the chip reads as “hurry” without clashing with light or dark menu backgrounds.
 */
export function resolveLowStockTokens(theme: DigitalMenuTheme): {
  accent: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
} {
  const { colors } = theme;
  const surface = parseHex(colors.surface);
  const surfaceIsLight = surface ? relativeLuminance(surface) > 0.45 : true;
  const badgeText = surfaceIsLight ? URGENCY_TEXT_ON_LIGHT : URGENCY_TEXT_ON_DARK;

  return {
    accent: LOW_STOCK_URGENCY_HUE,
    badgeBg: `color-mix(in srgb, ${LOW_STOCK_URGENCY_HUE} 16%, ${colors.surface})`,
    badgeText,
    badgeBorder: `color-mix(in srgb, ${LOW_STOCK_URGENCY_HUE} 34%, ${colors.border})`,
  };
}
