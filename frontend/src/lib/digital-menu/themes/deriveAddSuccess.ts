import type { DigitalMenuTheme, DigitalMenuThemeColors } from './types';
import { THEME_ADD_SUCCESS } from './themeAddSuccess';

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

function deriveAddSuccessTextFallback(
  colors: DigitalMenuThemeColors,
  successBackground: string,
): string {
  const bg = parseHex(successBackground);
  if (!bg) return colors.surface;
  return relativeLuminance(bg) > 0.62 ? colors.text : colors.surface;
}

export function resolveAddSuccessTokens(theme: DigitalMenuTheme): {
  addSuccess: string;
  addSuccessText: string;
} {
  const mapped = THEME_ADD_SUCCESS[theme.id];
  const addSuccess = theme.colors.addSuccess ?? mapped?.addSuccess ?? theme.colors.accent;
  const addSuccessText =
    theme.colors.addSuccessText ??
    mapped?.addSuccessText ??
    deriveAddSuccessTextFallback(theme.colors, addSuccess);

  return { addSuccess, addSuccessText };
}
