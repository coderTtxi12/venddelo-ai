import type { RestaurantPaymentMethod, RestaurantSchedule } from '@/lib/api/types';

export type RestaurantServiceType = 'takeout' | 'delivery';

export const RESTAURANT_SERVICE_LABELS: Record<RestaurantServiceType, string> = {
  takeout: 'Recoger en tienda',
  delivery: 'Entrega a domicilio',
};

export const RESTAURANT_SERVICE_ORDER: RestaurantServiceType[] = ['takeout', 'delivery'];

function isServiceType(value: string): value is RestaurantServiceType {
  return value === 'takeout' || value === 'delivery';
}

export function resolveRestaurantServices(restaurant: {
  takeout_enabled: boolean;
  delivery_enabled: boolean;
}): RestaurantServiceType[] {
  return RESTAURANT_SERVICE_ORDER.filter((type) =>
    type === 'takeout' ? restaurant.takeout_enabled : restaurant.delivery_enabled,
  );
}
