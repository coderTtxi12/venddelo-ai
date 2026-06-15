import type { CSSProperties } from "react";

export const PALETTES = ["sunset", "ocean", "forest", "classic", "midnight"] as const;

export type Palette = (typeof PALETTES)[number];

export const PALETTE_VARS: Record<Palette, Record<string, string>> = {
  sunset: {
    "--brand": "#e85d4c",
    "--brand-muted": "#f4a261",
    "--surface": "#fff8f5",
    "--text": "#2d1b1b",
  },
  ocean: {
    "--brand": "#1d6fb8",
    "--brand-muted": "#48cae4",
    "--surface": "#f0f9ff",
    "--text": "#0f172a",
  },
  forest: {
    "--brand": "#2d6a4f",
    "--brand-muted": "#95d5b2",
    "--surface": "#f1faee",
    "--text": "#1b4332",
  },
  classic: {
    "--brand": "#1a1a1a",
    "--brand-muted": "#6b7280",
    "--surface": "#fafafa",
    "--text": "#111827",
  },
  midnight: {
    "--brand": "#6366f1",
    "--brand-muted": "#a5b4fc",
    "--surface": "#0f172a",
    "--text": "#f8fafc",
  },
};

export function paletteStyle(palette: string | null | undefined): CSSProperties {
  const key = (PALETTES.includes(palette as Palette) ? palette : "classic") as Palette;
  return PALETTE_VARS[key] as CSSProperties;
}
