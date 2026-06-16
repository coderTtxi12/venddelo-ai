import { apiRequest } from '@/lib/api/client';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';

export type AssetUpload = {
  path: string;
  public_url: string;
};

export async function uploadRestaurantAsset(
  token: string,
  restaurantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const optimized = await prepareImageForUpload(file);

  const form = new FormData();
  form.append('file', optimized);

  const result = await apiRequest<AssetUpload>(
    `/restaurants/${restaurantId}/assets?folder=${encodeURIComponent(folder)}`,
    { method: 'POST', token, body: form },
  );

  return result.path;
}
