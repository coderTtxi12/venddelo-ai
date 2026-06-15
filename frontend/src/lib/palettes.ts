import type { CSSProperties } from "react";

/** Restaurant-facing palettes — all light theme */
export const PALETTES = ["sunset", "ocean", "forest", "classic", "terracotta"] as const;

export type Palette = (typeof PALETTES)[number];

/** Maps legacy backend value to light equivalent */
export function normalizePaletteKey(palette: string | null | undefined): Palette {
  if (palette === "midnight") return "terracotta";
  if (PALETTES.includes(palette as Palette)) return palette as Palette;
  return "sunset";
}

export const PALETTE_VARS: Record<Palette, Record<string, string>> = {
  sunset: {
    "--brand": "#dc2626",
    "--brand-muted": "#f87171",
    "--brand-soft": "#fef2f2",
    "--surface": "#fffbfb",
    "--text": "#450a0a",
    "--border": "#fecaca",
  },
  ocean: {
    "--brand": "#0369a1",
    "--brand-muted": "#38bdf8",
    "--brand-soft": "#f0f9ff",
    "--surface": "#f8fcff",
    "--text": "#0c4a6e",
    "--border": "#bae6fd",
  },
  forest: {
    "--brand": "#15803d",
    "--brand-muted": "#4ade80",
    "--brand-soft": "#f0fdf4",
    "--surface": "#f7fef9",
    "--text": "#14532d",
    "--border": "#bbf7d0",
  },
  classic: {
    "--brand": "#44403c",
    "--brand-muted": "#a8a29e",
    "--brand-soft": "#fafaf9",
    "--surface": "#ffffff",
    "--text": "#1c1917",
    "--border": "#e7e5e4",
  },
  terracotta: {
    "--brand": "#c2410c",
    "--brand-muted": "#fb923c",
    "--brand-soft": "#fff7ed",
    "--surface": "#fffcf9",
    "--text": "#431407",
    "--border": "#fed7aa",
  },
};

export const PALETTE_LABELS: Record<Palette, string> = {
  sunset: "Sunset",
  ocean: "Ocean",
  forest: "Forest",
  classic: "Classic",
  terracotta: "Terracotta",
};

export function paletteStyle(palette: string | null | undefined): CSSProperties {
  const key = normalizePaletteKey(palette);
  return PALETTE_VARS[key] as CSSProperties;
}
