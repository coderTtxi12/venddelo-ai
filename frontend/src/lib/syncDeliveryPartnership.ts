import type { RestaurantDeliveryPartnership } from '@/lib/api/types';
import {
  getRestaurantDeliveryPartnership,
  requestRestaurantDeliveryPartnership,
} from '@/lib/api/restaurants';

export async function syncRestaurantDeliveryPartnership(
  token: string,
  restaurantId: string,
  deliveryEnabled: boolean,
): Promise<RestaurantDeliveryPartnership | null> {
  if (!deliveryEnabled) return null;

  const current = await getRestaurantDeliveryPartnership(token, restaurantId);
  if (current.partnership) return current.partnership;

  const requested = await requestRestaurantDeliveryPartnership(token, restaurantId);
  return requested.partnership;
}
