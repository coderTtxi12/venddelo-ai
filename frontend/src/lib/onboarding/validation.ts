import { findCountryByIso, formatE164 } from '@/lib/phone/countryDialCodes';
import { normalizeOnboardingScheduleDrafts } from '@/lib/onboarding/schedule';
import { validateScheduleDrafts } from '@/lib/restaurantScheduleHours';
import type { OnboardingData, OnboardingStepId } from './types';

export function validateStep(stepId: OnboardingStepId, data: OnboardingData): string | null {
  switch (stepId) {
    case 'businessName':
      if (data.businessName.trim().length < 2) {
        return 'Escribe el nombre de tu negocio (mínimo 2 caracteres).';
      }
      return null;

    case 'description': {
      const text = data.businessDescription.trim();
      if (text.length > 500) {
        return 'La descripción puede tener máximo 500 caracteres.';
      }
      return null;
    }

    case 'ownerName':
      if (data.ownerName.trim().length < 2) {
        return 'Indica quién es el responsable del negocio.';
      }
      return null;

    case 'ownerPhone': {
      const digits = data.ownerPhoneLocal.replace(/\D/g, '');
      if (digits.length < 8) {
        return 'Ingresa un número de celular válido.';
      }
      return null;
    }

    case 'branchCount':
      if (!Number.isFinite(data.branchCount) || data.branchCount < 1 || data.branchCount > 999) {
        return 'Indica cuántas sucursales tiene tu negocio (mínimo 1).';
      }
      return null;

    case 'logo':
      if (!data.logoDataUrl) {
        return 'Sube el logo de tu negocio para continuar.';
      }
      return null;

    case 'cover':
      if (!data.coverDataUrl) {
        return 'Sube una foto de portada para tu menú digital.';
      }
      return null;

    case 'location':
      if (!data.location.address.trim()) {
        return 'Busca y selecciona la ubicación de tu negocio.';
      }
      if (data.location.latitude == null || data.location.longitude == null) {
        return 'Confirma la ubicación exacta en el mapa.';
      }
      return null;

    case 'schedule':
      return validateScheduleDrafts(normalizeOnboardingScheduleDrafts(data.scheduleDrafts));

    case 'orderTypes':
      if (!data.deliveryEnabled && !data.takeoutEnabled) {
        return 'Activa al menos un tipo de pedido.';
      }
      return null;

    case 'paymentMethods': {
      const takeout = data.paymentMatrix.takeout;
      const anyEnabled = takeout.cash || takeout.transfer || takeout.card_terminal;
      if (!anyEnabled) {
        return 'Selecciona al menos un método de pago para recoger en tienda.';
      }
      return null;
    }

    case 'whatsapp': {
      const digits = data.whatsappLocal.replace(/\D/g, '');
      if (digits.length < 8) {
        return 'Ingresa el WhatsApp de tu negocio.';
      }
      return null;
    }

    default:
      return null;
  }
}

export function buildRestaurantDescription(data: OnboardingData): string | null {
  const text = data.businessDescription.trim();
  return text.length > 0 ? text : null;
}

export function buildWhatsappE164(data: OnboardingData): string {
  const country = findCountryByIso(data.whatsappCountryIso);
  return formatE164(country.dialCode, data.whatsappLocal);
}
