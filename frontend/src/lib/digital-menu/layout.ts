/** Altura del banner de portada del menú (px). Debe coincidir con `--dm-cover-height` en CSS. */
export const DIGITAL_MENU_COVER_HEIGHT_PX = 168;

export const DIGITAL_MENU_PINNED_BAR_HEIGHT_PX = 48;

/** Ancho mínimo del layout móvil en banda tablet (px). */
export const PUBLIC_MENU_TABLET_MIN_WIDTH = 768;

/** Ancho mínimo del layout escritorio (px). */
export const PUBLIC_MENU_DESKTOP_MIN_WIDTH = 1024;

export type PublicMenuViewportBand = 'mobile' | 'tablet' | 'desktop';

export function getPublicMenuViewportBand(width: number): PublicMenuViewportBand {
  if (width >= PUBLIC_MENU_DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= PUBLIC_MENU_TABLET_MIN_WIDTH) return 'tablet';
  return 'mobile';
}
