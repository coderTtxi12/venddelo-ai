const MOTORCYCLE_COLOR_HEX: Record<string, string> = {
  rojo: '#DC2626',
  azul: '#2563EB',
  negro: '#111827',
  blanco: '#E5E7EB',
  gris: '#6B7280',
  verde: '#16A34A',
  amarillo: '#EAB308',
  naranja: '#EA580C',
  plata: '#94A3B8',
  cafe: '#92400E',
  café: '#92400E',
  morado: '#7C3AED',
};

export function motorcycleColorHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return MOTORCYCLE_COLOR_HEX[trimmed.toLowerCase()] ?? '#2563EB';
}

export function vehicleTypeLabel(type: string): string {
  return type === 'moto' ? 'Moto' : type;
}

export function riderPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function riderTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = riderPhoneDigits(trimmed);
  if (digits.length < 8) return null;
  return trimmed.startsWith('+') ? `tel:${trimmed.replace(/\s/g, '')}` : `tel:+${digits}`;
}

export function riderWhatsAppHref(
  phone: string,
  firstName: string,
  shortId: string,
): string | null {
  const digits = riderPhoneDigits(phone);
  if (digits.length < 8) return null;
  const text = encodeURIComponent(
    `Hola ${firstName}, te escribo por la entrega ${shortId}.`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}
