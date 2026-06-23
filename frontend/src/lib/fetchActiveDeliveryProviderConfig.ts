import {
  listActiveDeliveryProviderPaymentMethods,
  listActiveDeliveryProviderSchedules,
} from '@/lib/api/restaurants';
import type {
  DeliveryProviderPaymentMethod,
  DeliveryProviderSchedule,
  RestaurantDeliveryPartnership,
} from '@/lib/api/types';

export type ActiveDeliveryProviderConfig = {
  schedules: DeliveryProviderSchedule[];
  paymentMethods: DeliveryProviderPaymentMethod[];
};

export function isActiveDeliveryPartnership(
  partnership: RestaurantDeliveryPartnership | null | undefined,
): boolean {
  return partnership?.status === 'active';
}

export async function fetchActiveDeliveryProviderConfig(
  token: string,
  restaurantId: string,
  partnership: RestaurantDeliveryPartnership | null,
): Promise<ActiveDeliveryProviderConfig | null> {
  if (!isActiveDeliveryPartnership(partnership)) return null;

  const [schedules, paymentMethods] = await Promise.all([
    listActiveDeliveryProviderSchedules(token, restaurantId),
    listActiveDeliveryProviderPaymentMethods(token, restaurantId),
  ]);

  return { schedules, paymentMethods };
}
