import { apiRequest } from './client';

export type ImportAssetKind = 'menu_source' | 'product_photo';

export type ChatAttachmentRef = {
  storage_path: string;
  original_name: string;
  mime_type: string;
  kind: ImportAssetKind;
  size_bytes: number;
};

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

/** Chat composer uploads: menu documents and menu photos use menu_source. */
export function inferChatAttachmentKind(file: File): ImportAssetKind {
  const mime = normalizeMime(file);
  if (MENU_SOURCE_MIMES.has(mime)) return 'menu_source';
  if (mime.startsWith('image/')) return 'menu_source';

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf') || lowerName.endsWith('.docx')) return 'menu_source';
  if (/\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i.test(file.name)) return 'menu_source';

  return 'menu_source';
}

export const CHAT_ATTACHMENT_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic';

export const MAX_CHAT_ATTACHMENTS = 10;

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
