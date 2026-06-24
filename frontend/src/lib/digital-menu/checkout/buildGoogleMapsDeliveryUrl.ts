import type { CheckoutFulfillment } from './fulfillment';

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
