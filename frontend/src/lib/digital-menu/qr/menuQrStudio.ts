import { MENU_QR_PRESET_CATALOG } from './menuQrPresets';

export type MenuQrDotStyle =
  | 'square'
  | 'dots'
  | 'rounded'
  | 'extra-rounded'
  | 'classy'
  | 'classy-rounded';

export type MenuQrCornerStyle = 'square' | 'dot' | 'extra-rounded';

export type MenuQrConfig = {
  dotColor: string;
  cornerColor: string;
  cornerDotColor: string;
  backgroundColor: string;
  transparentBackground: boolean;
  dotStyle: MenuQrDotStyle;
  cornerStyle: MenuQrCornerStyle;
  cornerDotStyle: MenuQrCornerStyle;
  /** Tamaño visual en pantalla (px). El render interno usa escala HD. */
  margin: number;
  size: number;
};

/** Escala interna del canvas para vista previa nítida en pantallas retina. */
export const MENU_QR_PREVIEW_RENDER_SCALE = 4;

/** Escala para exportación PNG/JPG/PDF e impresión. */
export const MENU_QR_EXPORT_RENDER_SCALE = 8;

export const DEFAULT_MENU_QR_CONFIG: MenuQrConfig = {
  dotColor: '#0f172a',
  cornerColor: '#0f172a',
  cornerDotColor: '#0f172a',
  backgroundColor: '#ffffff',
  transparentBackground: false,
  dotStyle: 'rounded',
  cornerStyle: 'extra-rounded',
  cornerDotStyle: 'dot',
  margin: 16,
  size: 320,
};

export type MenuQrPreset = {
  id: string;
  label: string;
  /** ui-ux-pro-max product / style reference */
  theme: string;
  config: Partial<MenuQrConfig>;
};

export const MENU_QR_PRESETS: MenuQrPreset[] = MENU_QR_PRESET_CATALOG;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null;
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const int = Number.parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function getMenuQrContrastRatio(
  foreground: string,
  background: string,
  transparentBackground: boolean,
): number | null {
  if (transparentBackground) return null;

  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return null;

  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getMenuQrRenderPixelSize(config: MenuQrConfig, scale: number): number {
  return Math.round(config.size * scale);
}

/** ISO/IEC 18004: quiet zone + high contrast — aim for ≥ 4.5:1 when background is opaque. */
export function getMenuQrScanSafety(config: MenuQrConfig): {
  level: 'good' | 'warn' | 'poor';
  message: string;
} {
  if (config.transparentBackground) {
    return {
      level: 'warn',
      message:
        'Con fondo transparente, prueba el QR sobre el color real del soporte (mesa, vitrina, cartel). Escanea antes de imprimir.',
    };
  }

  const ratio = getMenuQrContrastRatio(
    config.dotColor,
    config.backgroundColor,
    config.transparentBackground,
  );

  if (ratio == null) {
    return {
      level: 'warn',
      message: 'Revisa que los colores sean válidos y con buen contraste antes de usar el QR.',
    };
  }

  if (ratio >= 7) {
    return {
      level: 'good',
      message: 'Contraste excelente para escaneo. Aun así, prueba con tu celular antes de imprimir.',
    };
  }

  if (ratio >= 4.5) {
    return {
      level: 'good',
      message: 'Contraste adecuado para escaneo. Prueba con tu celular antes de imprimir o publicar.',
    };
  }

  if (ratio >= 3) {
    return {
      level: 'warn',
      message:
        'Contraste bajo: algunos lectores pueden fallar. Oscurece el QR o aclara el fondo.',
    };
  }

  return {
    level: 'poor',
    message: 'Contraste insuficiente para escaneo confiable. Usa un preset clásico o ajusta colores.',
  };
}

export function resolveMenuQrBackground(config: MenuQrConfig): string {
  return config.transparentBackground ? 'transparent' : config.backgroundColor;
}

export function mergeMenuQrPreset(presetId: string, current: MenuQrConfig): MenuQrConfig | null {
  const preset = MENU_QR_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  return { ...current, ...preset.config };
}
