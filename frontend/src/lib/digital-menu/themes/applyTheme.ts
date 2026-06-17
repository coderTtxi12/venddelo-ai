import type { CSSProperties } from 'react';
import type { DigitalMenuTheme, DigitalMenuThemeCssVars } from './types';

const BORDER_RADIUS_MAP = {
  sharp: '8px',
  rounded: '12px',
  soft: '16px',
  pill: '999px',
} as const;

/** Maps a theme to CSS custom properties for the phone preview root. */
export function digitalMenuThemeToCssVars(theme: DigitalMenuTheme): DigitalMenuThemeCssVars {
  const { colors, typography, style } = theme;

  return {
    '--dm-primary': colors.primary,
    '--dm-secondary': colors.secondary,
    '--dm-accent': colors.accent,
    '--dm-bg': colors.background,
    '--dm-surface': colors.surface,
    '--dm-text': colors.text,
    '--dm-text-muted': colors.textMuted,
    '--dm-text-secondary': colors.textSecondary,
    '--dm-border': colors.border,
    '--dm-category-active': colors.categoryActive,
    '--dm-category-indicator': colors.categoryIndicator,
    '--dm-price': colors.price,
    '--dm-price-original': colors.priceOriginal,
    '--dm-price-sale': colors.priceSale,
    '--dm-discount-badge-bg': colors.discountBadgeBg,
    '--dm-discount-badge-text': colors.discountBadgeText,
    '--dm-cover-from': colors.coverPlaceholderFrom,
    '--dm-cover-to': colors.coverPlaceholderTo,
    '--dm-cover-scrim': colors.coverScrim,
    '--dm-float-btn-bg': colors.floatButtonBg,
    '--dm-float-btn-text': colors.floatButtonText,
    '--dm-logo-border': colors.logoBorder,
    '--dm-logo-placeholder-bg': colors.logoPlaceholderBg,
    '--dm-product-thumb-bg': colors.productThumbBg,
    '--dm-font-heading': typography.headingFont,
    '--dm-font-body': typography.bodyFont,
    '--dm-font-heading-weight': String(typography.headingWeight),
    '--dm-font-body-weight': String(typography.bodyWeight),
    '--dm-radius-card': `${style.cardRadiusPx}px`,
    '--dm-radius-ui': BORDER_RADIUS_MAP[style.borderRadius],
  };
}

export function digitalMenuThemeToStyle(theme: DigitalMenuTheme): CSSProperties {
  return digitalMenuThemeToCssVars(theme) as CSSProperties;
}

/** Injects the theme Google Font link idempotently (client-side). */
export function loadDigitalMenuThemeFonts(theme: DigitalMenuTheme): void {
  if (typeof document === 'undefined') return;
  if (!theme.typography.googleFontsUrl) return;

  const id = `dm-font-${theme.id}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = theme.typography.googleFontsUrl;
  document.head.appendChild(link);
}
