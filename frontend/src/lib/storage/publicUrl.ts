const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'assets';

/** Convierte un path de Supabase Storage en URL pública para `<img src>`. */
export function storagePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:') ||
    path.startsWith('memory://')
  ) {
    return path;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return `/${path.replace(/^\//, '')}`;

  const normalized = path.replace(/^\//, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${normalized}`;
}

/** Extrae el path de storage desde una URL pública o path relativo. */
export function storagePathFromUrl(url: string): string {
  if (url.startsWith('restaurants/')) return url;

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) return url.slice(idx + marker.length);

  return url.replace(/^\//, '');
}
