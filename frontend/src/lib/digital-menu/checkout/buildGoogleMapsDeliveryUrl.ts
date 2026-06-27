import type { Restaurant } from '@/lib/api/types';
import type { CheckoutFulfillment } from './fulfillment';

export type RestaurantMapLocation = Pick<Restaurant, 'address' | 'latitude' | 'longitude'>;

/** Google Maps deep link for the delivery pin or address fallback. */
export function buildGoogleMapsDeliveryUrl(fulfillment: CheckoutFulfillment): string | null {
  if (fulfillment.serviceType !== 'delivery') return null;

  const { deliveryLatitude, deliveryLongitude, deliveryAddress } = fulfillment;

  if (deliveryLatitude != null && deliveryLongitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${deliveryLatitude},${deliveryLongitude}`;
  }

  const address = deliveryAddress.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Google Maps deep link for the restaurant pin or address fallback. */
export function buildGoogleMapsRestaurantUrl(
  location: RestaurantMapLocation | null | undefined,
): string | null {
  if (!location) return null;

  if (location.latitude != null && location.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }

  const address = location.address?.trim();
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
