import type { RestaurantSchedule } from '@/lib/api/types';
import {
  resolveRestaurantOpenStatus,
  type RestaurantOpenStatus,
} from '@/lib/restaurantScheduleHours';
import { PUBLIC_MENU_SCHEDULE_SERVICE_TYPES } from '@/lib/restaurantServices';

/** Horario del restaurante (takeout) — nunca delivery. */
export function resolveCheckoutRestaurantOpenStatus(
  schedules: RestaurantSchedule[],
  now = new Date(),
): RestaurantOpenStatus {
  return resolveRestaurantOpenStatus(
    schedules,
    PUBLIC_MENU_SCHEDULE_SERVICE_TYPES,
    now,
  );
}

export function hasRestaurantTakeoutHours(schedules: RestaurantSchedule[]): boolean {
  return schedules.some((entry) => entry.service_type === 'takeout');
}

export function isRestaurantOpenForCheckout(
  status: RestaurantOpenStatus,
  schedules: RestaurantSchedule[],
): boolean {
  if (!hasRestaurantTakeoutHours(schedules)) return true;
  return status.state === 'open';
}

export function buildCheckoutClosedMessage(status: RestaurantOpenStatus): string {
  if (status.detail) {
    return `El restaurante está cerrado. ${status.detail}. No puedes enviar pedidos en este momento.`;
  }

  return 'El restaurante está cerrado. Vuelve durante el horario de atención para enviar tu pedido.';
}
