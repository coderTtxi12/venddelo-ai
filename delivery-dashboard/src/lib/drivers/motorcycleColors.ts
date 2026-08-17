export type MotorcycleColorOption = {
  id: string;
  label: string;
  hex: string;
};

export const MOTORCYCLE_COLOR_PRESETS: MotorcycleColorOption[] = [
  { id: 'negro', label: 'Negro', hex: '#111827' },
  { id: 'blanco', label: 'Blanco', hex: '#F8FAFC' },
  { id: 'rojo', label: 'Rojo', hex: '#DC2626' },
  { id: 'azul', label: 'Azul', hex: '#1D4ED8' },
  { id: 'gris', label: 'Gris', hex: '#64748B' },
  { id: 'plata', label: 'Plata', hex: '#94A3B8' },
  { id: 'verde', label: 'Verde', hex: '#15803D' },
  { id: 'amarillo', label: 'Amarillo', hex: '#CA8A04' },
  { id: 'naranja', label: 'Naranja', hex: '#EA580C' },
  { id: 'cafe', label: 'Café', hex: '#92400E' },
  { id: 'morado', label: 'Morado', hex: '#7C3AED' },
];

export const CUSTOM_MOTORCYCLE_COLOR_ID = 'otro';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function motorcycleColorIsCustom(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !MOTORCYCLE_COLOR_PRESETS.some(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
}

export function motorcycleColorHex(value: string, fallback = '#2563EB'): string {
  const trimmed = value.trim();
  if (HEX_RE.test(trimmed)) return trimmed.toUpperCase();
  const preset = MOTORCYCLE_COLOR_PRESETS.find(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  return preset?.hex ?? fallback;
}
