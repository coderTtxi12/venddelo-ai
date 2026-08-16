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

export function getDeliveryPartnershipStatusHint(
  status: RestaurantDeliveryPartnership['status'],
  zoneName?: string | null,
): string {
  const base = DELIVERY_PARTNERSHIP_STATUS_HINTS[status];
  if (!zoneName) return base;

  if (status === 'active') {
    return `Mexy Reparto gestiona las entregas a domicilio de tu restaurante en la zona ${zoneName}.`;
  }

  if (status === 'pending') {
    return `Tu solicitud para la zona ${zoneName} está pendiente de aprobación. Mexy Reparto revisará los datos de tu restaurante.`;
  }

  return base;
}
