import type { PaymentMethodKey } from '@/lib/restaurantPaymentConfig';
import type { RestaurantServiceType } from '@/lib/restaurantServices';
import type { CheckoutFulfillment } from './fulfillment';

const STORAGE_PREFIX = 'venddelo:public-checkout:';

export type StoredCheckoutPreferences = {
  serviceType: RestaurantServiceType;
  paymentMethod: PaymentMethodKey | null;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  deliveryPlaceId: string | null;
  customerName: string;
  customerPhone: string;
};

export function checkoutPreferencesStorageKey(subdomain: string): string {
  return `${STORAGE_PREFIX}${subdomain}`;
}

function isPaymentMethodKey(value: unknown): value is PaymentMethodKey {
  return value === 'cash' || value === 'transfer' || value === 'card_terminal';
}

function isServiceType(value: unknown): value is RestaurantServiceType {
  return value === 'takeout' || value === 'delivery';
}

function parseStoredCheckoutPreferences(raw: string): StoredCheckoutPreferences | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCheckoutPreferences>;
    if (!parsed || !isServiceType(parsed.serviceType)) return null;

    const paymentMethod =
      parsed.paymentMethod == null
        ? null
        : isPaymentMethodKey(parsed.paymentMethod)
          ? parsed.paymentMethod
          : null;

    const deliveryLatitude =
      typeof parsed.deliveryLatitude === 'number' ? parsed.deliveryLatitude : null;
    const deliveryLongitude =
      typeof parsed.deliveryLongitude === 'number' ? parsed.deliveryLongitude : null;

    return {
      serviceType: parsed.serviceType,
      paymentMethod,
      deliveryAddress: typeof parsed.deliveryAddress === 'string' ? parsed.deliveryAddress : '',
      deliveryLatitude,
      deliveryLongitude,
      deliveryPlaceId:
        typeof parsed.deliveryPlaceId === 'string' ? parsed.deliveryPlaceId : null,
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      customerPhone: typeof parsed.customerPhone === 'string' ? parsed.customerPhone : '',
    };
  } catch {
    return null;
  }
}

export function readCheckoutPreferencesFromStorage(
  subdomain: string,
): StoredCheckoutPreferences | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(checkoutPreferencesStorageKey(subdomain));
  if (!raw) return null;
  return parseStoredCheckoutPreferences(raw);
}

export function toStoredCheckoutPreferences(
  fulfillment: CheckoutFulfillment,
): StoredCheckoutPreferences {
  return {
    serviceType: fulfillment.serviceType,
    paymentMethod: fulfillment.paymentMethod,
    deliveryAddress: fulfillment.deliveryAddress,
    deliveryLatitude: fulfillment.deliveryLatitude,
    deliveryLongitude: fulfillment.deliveryLongitude,
    deliveryPlaceId: fulfillment.deliveryPlaceId,
    customerName: fulfillment.customerName,
    customerPhone: fulfillment.customerPhone,
  };
}

export function writeCheckoutPreferencesToStorage(
  subdomain: string,
  preferences: StoredCheckoutPreferences,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      checkoutPreferencesStorageKey(subdomain),
      JSON.stringify(preferences),
    );
  } catch {
    // Quota exceeded or private browsing — ignore silently.
  }
}
