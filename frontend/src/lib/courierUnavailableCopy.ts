import type { PublicDeliveryService } from '@/lib/api/public';

export const COURIER_UNAVAILABLE_TITLE =
  'El servicio de reparto no está disponible en este momento.';

const FALLBACK_DETAIL = 'Inténtalo de nuevo en unos minutos.';

export type CourierServiceNoticeTone = 'blocked' | 'weather';

export type CourierServiceNoticeCopy = {
  title: string;
  detail: string;
  tone: CourierServiceNoticeTone;
};

function unavailableCopy(reason: string | null): CourierServiceNoticeCopy {
  if (!reason) {
    return { title: COURIER_UNAVAILABLE_TITLE, detail: FALLBACK_DETAIL, tone: 'blocked' };
  }

  if (/lluvia intensa/i.test(reason)) {
    const resume = reason.match(/Reanuda\s+(.+?)(?:\s+Además|$)/);
    return {
      title: COURIER_UNAVAILABLE_TITLE,
      detail: resume
        ? `Mexy pausó las entregas por lluvia intensa. El horario reanuda ${resume[1].trim()}`
        : 'Mexy pausó las entregas por lluvia intensa. No puedes solicitar un repartidor hasta que las condiciones mejoren.',
      tone: 'blocked',
    };
  }

  if (/pausó las entregas/i.test(reason)) {
    return {
      title: COURIER_UNAVAILABLE_TITLE,
      detail:
        'Mexy pausó las entregas. No puedes solicitar un repartidor hasta que lo reactiven.',
      tone: 'blocked',
    };
  }

  if (/fuera del horario de operación/i.test(reason)) {
    const resume = reason.match(/Reanuda\s+(.+)$/);
    return {
      title: COURIER_UNAVAILABLE_TITLE,
      detail: resume
        ? `Está fuera del horario de operación de Mexy. Reanuda ${resume[1].trim()}`
        : 'Está fuera del horario de operación de Mexy. Inténtalo de nuevo cuando abra el servicio.',
      tone: 'blocked',
    };
  }

  const stripped = reason.startsWith(COURIER_UNAVAILABLE_TITLE)
    ? reason.slice(COURIER_UNAVAILABLE_TITLE.length).trim()
    : reason;

  return {
    title: COURIER_UNAVAILABLE_TITLE,
    detail: stripped || FALLBACK_DETAIL,
    tone: 'blocked',
  };
}

export function restaurantCourierUnavailableCopy(reason: string | null): {
  title: string;
  detail: string;
} {
  const { title, detail } = unavailableCopy(reason);
  return { title, detail };
}

export function restaurantCourierServiceNotice(
  service: Pick<PublicDeliveryService, 'available' | 'reason' | 'weather_mode'> | null,
): CourierServiceNoticeCopy | null {
  if (!service) return null;
  if (!service.available) return unavailableCopy(service.reason);
  return null;
}
