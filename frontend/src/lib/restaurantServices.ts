import type { RestaurantPaymentMethod, RestaurantSchedule } from '@/lib/api/types';

export type RestaurantServiceType = 'takeout' | 'delivery';

export const RESTAURANT_SERVICE_LABELS: Record<RestaurantServiceType, string> = {
  takeout: 'Recoger en tienda',
  delivery: 'Entrega a domicilio',
};

export const RESTAURANT_SERVICE_ORDER: RestaurantServiceType[] = ['delivery', 'takeout'];

/** Horarios que el dueño edita en el panel (delivery lo gestiona el proveedor). */
export const DASHBOARD_SCHEDULE_SERVICE_TYPES: RestaurantServiceType[] = ['takeout'];

/** Horarios informativos en el panel (gestionados por el proveedor de entrega). */
export const DASHBOARD_INFO_SCHEDULE_SERVICE_TYPES: RestaurantServiceType[] = ['delivery'];

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
