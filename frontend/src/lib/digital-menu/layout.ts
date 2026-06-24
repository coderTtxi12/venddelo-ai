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

/** Ancho del frame de preview tablet en el editor del dashboard (px). */
export const EDITOR_PREVIEW_TABLET_FRAME_WIDTH = 820;

/** Ancho mínimo del frame de preview escritorio en el editor (px). */
export const EDITOR_PREVIEW_DESKTOP_FRAME_MIN_WIDTH = PUBLIC_MENU_DESKTOP_MIN_WIDTH;

/** Padding horizontal total del contenedor del frame de preview (px). */
export const EDITOR_PREVIEW_FRAME_PADDING_X = 24;

export function getEditorPreviewPanelMinWidth(device: 'tablet' | 'desktop'): number {
  const frameWidth =
    device === 'tablet'
      ? EDITOR_PREVIEW_TABLET_FRAME_WIDTH
      : EDITOR_PREVIEW_DESKTOP_FRAME_MIN_WIDTH;
  return frameWidth + EDITOR_PREVIEW_FRAME_PADDING_X;
}

export function canShowEditorPreviewDevice(
  panelWidth: number,
  device: 'tablet' | 'desktop',
): boolean {
  return panelWidth >= getEditorPreviewPanelMinWidth(device);
}
