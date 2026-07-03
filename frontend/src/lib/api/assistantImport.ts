import { apiRequest } from './client';

export type ImportAssetKind = 'menu_source' | 'product_photo';

export type ImportAssetUpload = {
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  original_name: string;
  kind: ImportAssetKind;
};

const MENU_SOURCE_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function normalizeMime(file: File): string {
  return (file.type || '').split(';')[0].trim().toLowerCase();
}

export function inferImportAssetKind(file: File): ImportAssetKind {
  const mime = normalizeMime(file);
  if (MENU_SOURCE_MIMES.has(mime)) return 'menu_source';
  if (mime.startsWith('image/')) return 'product_photo';

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf') || lowerName.endsWith('.docx')) return 'menu_source';
  if (/\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i.test(file.name)) return 'product_photo';

  return 'menu_source';
}

export async function uploadImportAsset(
  accessToken: string,
  restaurantId: string,
  file: File,
  kind?: ImportAssetKind,
): Promise<ImportAssetUpload> {
  const resolvedKind = kind ?? inferImportAssetKind(file);
  const form = new FormData();
  form.append('file', file);

  return apiRequest<ImportAssetUpload>(
    `/restaurants/${restaurantId}/assistant/import/assets?kind=${encodeURIComponent(resolvedKind)}`,
    { method: 'POST', token: accessToken, body: form },
  );
}
