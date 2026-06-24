import type { PublicCheckoutConfig } from '@/lib/api/public';
import {
  PAYMENT_METHOD_ORDER,
  type PaymentMethodKey,
} from '@/lib/restaurantPaymentConfig';
import {
  RESTAURANT_SERVICE_ORDER,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';
import type { StoredCheckoutPreferences } from './preferencesStorage';

/** Phone is confirmed by the customer when they send the WhatsApp message (OlaClick-style). */
export const WHATSAPP_PENDING_CUSTOMER_PHONE = 'whatsapp';

export type CheckoutFulfillment = {
  serviceType: RestaurantServiceType;
  deliveryAddress: string;
  deliveryAddressDetails: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  deliveryPlaceId: string | null;
  deliveryFeeCents: number | null;
  paymentMethod: PaymentMethodKey | null;
  customerName: string;
};

export function formatDeliveryAddressForOrder(fulfillment: CheckoutFulfillment): string {
  const address = fulfillment.deliveryAddress.trim();
  const details = fulfillment.deliveryAddressDetails.trim();
  if (!details) return address;
  return `${address}\nReferencias: ${details}`;
}

export function isCustomerContactComplete(fulfillment: CheckoutFulfillment): boolean {
  return fulfillment.customerName.trim().length >= 2;
}

export const EMPTY_DELIVERY_LOCATION = {
  deliveryAddress: '',
  deliveryAddressDetails: '',
  deliveryLatitude: null as number | null,
  deliveryLongitude: null as number | null,
  deliveryPlaceId: null as string | null,
  deliveryFeeCents: null as number | null,
};

export function resolveAvailableServices(config: PublicCheckoutConfig): RestaurantServiceType[] {
  return RESTAURANT_SERVICE_ORDER.filter((type) =>
    type === 'takeout' ? config.takeout_enabled : config.delivery_enabled,
  );
}

export function resolveDefaultServiceType(
  config: PublicCheckoutConfig,
): RestaurantServiceType | null {
  const services = resolveAvailableServices(config);
  return services[0] ?? null;
}

export function enabledPaymentMethodsForService(
  config: PublicCheckoutConfig,
  serviceType: RestaurantServiceType,
): PaymentMethodKey[] {
  const enabled = new Set(
    config.payment_methods
      .filter((entry) => entry.service_type === serviceType)
      .map((entry) => entry.method),
  );
  return PAYMENT_METHOD_ORDER.filter((method) => enabled.has(method));
}

export function isFulfillmentComplete(
  fulfillment: CheckoutFulfillment,
  config: PublicCheckoutConfig | null,
  options?: {
    deliveryServiceAvailable?: boolean;
    deliveryQuoteAvailable?: boolean;
  },
): boolean {
  if (!config) return false;
  const services = resolveAvailableServices(config);
  if (!services.includes(fulfillment.serviceType)) return false;
  if (!fulfillment.paymentMethod) return false;
  if (!isCustomerContactComplete(fulfillment)) return false;
  const allowed = enabledPaymentMethodsForService(config, fulfillment.serviceType);
  if (!allowed.includes(fulfillment.paymentMethod)) return false;
  if (fulfillment.serviceType === 'delivery') {
    if (options?.deliveryServiceAvailable === false) return false;
    if (options?.deliveryQuoteAvailable === false) return false;
    return (
      fulfillment.deliveryAddress.trim().length >= 5 &&
      fulfillment.deliveryLatitude != null &&
      fulfillment.deliveryLongitude != null &&
      fulfillment.deliveryFeeCents != null &&
      fulfillment.deliveryFeeCents >= 0
    );
  }
  return true;
}

export function createInitialFulfillment(
  config: PublicCheckoutConfig,
): CheckoutFulfillment {
  const serviceType = resolveDefaultServiceType(config) ?? 'delivery';
  const paymentMethods = enabledPaymentMethodsForService(config, serviceType);
  return {
    serviceType,
    ...EMPTY_DELIVERY_LOCATION,
    paymentMethod: paymentMethods[0] ?? null,
    customerName: '',
  };
}

function isDeliveryServiceSelectable(config: PublicCheckoutConfig): boolean {
  return (
    config.delivery_enabled &&
    (config.delivery_service?.available ?? false)
  );
}

function hasStoredDeliveryLocation(saved: StoredCheckoutPreferences): boolean {
  return (
    saved.deliveryAddress.trim().length >= 5 &&
    saved.deliveryLatitude != null &&
    saved.deliveryLongitude != null
  );
}

export function resolveCheckoutFulfillmentFromPreferences(
  config: PublicCheckoutConfig,
  saved: StoredCheckoutPreferences | null,
): CheckoutFulfillment {
  const services = resolveAvailableServices(config);
  const deliverySelectable = isDeliveryServiceSelectable(config);

  let serviceType: RestaurantServiceType | null = null;
  if (saved?.serviceType && services.includes(saved.serviceType)) {
    if (saved.serviceType === 'delivery' && !deliverySelectable) {
      serviceType = null;
    } else {
      serviceType = saved.serviceType;
    }
  }

  if (!serviceType) {
    if (services.includes('delivery') && deliverySelectable) {
      serviceType = 'delivery';
    } else {
      serviceType = services[0] ?? 'takeout';
    }
  }

  const paymentMethods = enabledPaymentMethodsForService(config, serviceType);
  const paymentMethod =
    saved?.paymentMethod && paymentMethods.includes(saved.paymentMethod)
      ? saved.paymentMethod
      : (paymentMethods[0] ?? null);

  const customerName = saved?.customerName?.trim() ?? '';

  if (serviceType === 'delivery' && saved && hasStoredDeliveryLocation(saved)) {
    return {
      serviceType,
      deliveryAddress: saved.deliveryAddress,
      deliveryAddressDetails: saved.deliveryAddressDetails ?? '',
      deliveryLatitude: saved.deliveryLatitude,
      deliveryLongitude: saved.deliveryLongitude,
      deliveryPlaceId: saved.deliveryPlaceId,
      deliveryFeeCents: null,
      paymentMethod,
      customerName,
    };
  }

  return {
    serviceType,
    ...EMPTY_DELIVERY_LOCATION,
    paymentMethod,
    customerName,
  };
}

export function reconcileCheckoutFulfillment(
  config: PublicCheckoutConfig,
  fulfillment: CheckoutFulfillment,
): CheckoutFulfillment {
  const services = resolveAvailableServices(config);
  const deliverySelectable = isDeliveryServiceSelectable(config);

  let serviceType = fulfillment.serviceType;
  if (!services.includes(serviceType)) {
    serviceType = services.includes('delivery') && deliverySelectable ? 'delivery' : services[0]!;
  }

  const methods = enabledPaymentMethodsForService(config, serviceType);
  const paymentMethod =
    fulfillment.paymentMethod && methods.includes(fulfillment.paymentMethod)
      ? fulfillment.paymentMethod
      : (methods[0] ?? null);

  if (serviceType === 'delivery') {
    return {
      serviceType,
      deliveryAddress: fulfillment.deliveryAddress,
      deliveryAddressDetails: fulfillment.deliveryAddressDetails,
      deliveryLatitude: fulfillment.deliveryLatitude,
      deliveryLongitude: fulfillment.deliveryLongitude,
      deliveryPlaceId: fulfillment.deliveryPlaceId,
      deliveryFeeCents: fulfillment.deliveryFeeCents,
      paymentMethod,
      customerName: fulfillment.customerName,
    };
  }

  return {
    serviceType,
    ...EMPTY_DELIVERY_LOCATION,
    paymentMethod,
    customerName: fulfillment.customerName,
  };
}
