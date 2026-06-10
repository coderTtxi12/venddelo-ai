/**
 * Separa un teléfono guardado como cadena única (lada + número) para editar en dos campos.
 */
export function splitPhoneNumber(full: string | null): { lada: string; local: string } {
  if (!full || !full.trim()) return { lada: '+593', local: '' };
  const compact = full.replace(/\s/g, '');
  const m = compact.match(/^(\+\d{1,4})(\d{5,15})$/);
  if (m) return { lada: m[1], local: m[2] };
  if (compact.startsWith('+')) {
    return { lada: compact.slice(0, 4), local: compact.slice(4) };
  }
  return { lada: '+593', local: compact };
}
