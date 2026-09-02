/** Local calendar date for `<input type="date">` (YYYY-MM-DD). */
export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCouponStartLabel(startsOn: string | null): string | null {
  if (!startsOn) return null;
  return new Date(`${startsOn}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

export function formatCouponValidityRange(
  startsOn: string | null,
  expiresOn: string | null,
): string {
  const start = formatCouponStartLabel(startsOn);
  const end = expiresOn
    ? new Date(`${expiresOn}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })
    : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Hasta ${end}`;
  return 'Sin caducidad';
}
