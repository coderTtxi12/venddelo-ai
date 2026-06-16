import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { storagePathFromUrl } from '@/lib/storage/publicUrl';
import type { ImageDraft } from '@/services/db/supplierCatalogTypes';

export async function resolveImagePathForUpload(
  accessToken: string,
  restaurantId: string,
  folder: string,
  image: ImageDraft | null,
): Promise<string | null | undefined> {
  if (!image) return null;
  if (image.file) {
    return uploadRestaurantAsset(accessToken, restaurantId, folder, image.file);
  }
  const url = image.previewUrl;
  if (url && !url.startsWith('blob:') && !url.startsWith('data:')) {
    return storagePathFromUrl(url);
  }
  return undefined;
}
