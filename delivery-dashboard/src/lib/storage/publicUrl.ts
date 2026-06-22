const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'assets';

/** Convierte un path de Supabase Storage en URL pública para `<img src>`. */
export function storagePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return `/${path.replace(/^\//, '')}`;

  const normalized = path.replace(/^\//, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${normalized}`;
}
