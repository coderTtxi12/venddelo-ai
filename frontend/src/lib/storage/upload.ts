import { createClient } from '@/lib/supabase/client';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'assets';

export async function uploadRestaurantAsset(
  restaurantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `restaurants/${restaurantId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  return path;
}
