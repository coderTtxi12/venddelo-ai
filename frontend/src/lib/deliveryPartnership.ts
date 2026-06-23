import type { RestaurantDeliveryPartnership } from '@/lib/api/types';

export const DELIVERY_PARTNERSHIP_STATUS_LABELS: Record<
  RestaurantDeliveryPartnership['status'],
  string
> = {
  pending: 'En revisión',
  active: 'Activo',
  suspended: 'Suspendido',
};

export const DELIVERY_PARTNERSHIP_STATUS_HINTS: Record<
  RestaurantDeliveryPartnership['status'],
  string
> = {
  pending:
    'Tu solicitud está pendiente de aprobación. Mexy Reparto revisará los datos de tu restaurante.',
  active: 'Mexy Reparto gestiona las entregas a domicilio de tu restaurante.',
  suspended:
    'El servicio de reparto está suspendido temporalmente. Contacta a Mexy Reparto para más información.',
};
