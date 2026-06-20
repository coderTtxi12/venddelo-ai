import {
  createRestaurant,
  setRestaurantPaymentMethods,
  setRestaurantSchedules,
  updateRestaurant,
} from '@/lib/api/restaurants';
import { matrixToPaymentCreates } from '@/lib/restaurantPaymentConfig';
import { buildOnboardingSchedulePayload } from '@/lib/onboarding/schedule';
import { normalizeSubdomainInput } from '@/lib/restaurantSubdomain';
import { uploadRestaurantAsset } from '@/lib/storage/upload';
import { buildOwnerDescription, buildWhatsappE164 } from './validation';
import type { OnboardingData } from './types';

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(header ?? '')?.[1] ?? 'image/webp';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

function generateSubdomain(businessName: string): string {
  const slug = normalizeSubdomainInput(businessName);
  const base = (slug || 'negocio').slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`.slice(0, 63);
}

export async function submitOnboarding(
  token: string,
  data: OnboardingData,
): Promise<{ restaurantId: string }> {
  const subdomain = generateSubdomain(data.businessName);

  const restaurant = await createRestaurant(token, {
    name: data.businessName.trim(),
    subdomain,
    status: 'draft',
    description: buildOwnerDescription(data),
    address: data.location.address.trim(),
    latitude: data.location.latitude,
    longitude: data.location.longitude,
    place_id: data.location.placeId,
    whatsapp_phone: buildWhatsappE164(data),
    takeout_enabled: data.takeoutEnabled,
    delivery_enabled: data.deliveryEnabled,
  });

  const restaurantId = restaurant.id;

  if (data.logoDataUrl) {
    const logoFile = dataUrlToFile(data.logoDataUrl, data.logoFileName ?? 'logo.webp');
    const logoPath = await uploadRestaurantAsset(token, restaurantId, 'logo', logoFile);
    await updateRestaurant(token, restaurantId, { logo_path: logoPath });
  }

  if (data.coverDataUrl) {
    const coverFile = dataUrlToFile(data.coverDataUrl, data.coverFileName ?? 'cover.webp');
    const coverPath = await uploadRestaurantAsset(token, restaurantId, 'cover', coverFile);
    await updateRestaurant(token, restaurantId, { cover_path: coverPath });
  }

  const schedulePayload = buildOnboardingSchedulePayload(data.scheduleDrafts, {
    takeoutEnabled: data.takeoutEnabled,
    deliveryEnabled: data.deliveryEnabled,
  });
  if (schedulePayload.length > 0) {
    await setRestaurantSchedules(token, restaurantId, schedulePayload);
  }

  await setRestaurantPaymentMethods(token, restaurantId, matrixToPaymentCreates(data.paymentMatrix));

  return { restaurantId };
}
