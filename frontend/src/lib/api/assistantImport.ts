import { apiRequest } from './client';

export type ImportAssetKind = 'document' | 'image';

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

export const CHAT_ATTACHMENT_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic';

export const MAX_CHAT_ATTACHMENTS = 10;

export async function uploadImportAsset(
  accessToken: string,
  restaurantId: string,
  file: File,
): Promise<ImportAssetUpload> {
  const form = new FormData();
  form.append('file', file);

  return apiRequest<ImportAssetUpload>(
    `/restaurants/${restaurantId}/assistant/import/assets`,
    { method: 'POST', token: accessToken, body: form },
  );
}
