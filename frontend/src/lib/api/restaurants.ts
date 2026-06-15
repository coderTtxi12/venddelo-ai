import { apiRequest } from "./client";
import type {
  CursorPage,
  PaymentMethodInput,
  Restaurant,
  ScheduleInput,
} from "./types";

export function listRestaurants(token: string) {
  return apiRequest<CursorPage<Restaurant>>("/restaurants", { token });
}

export function getRestaurant(token: string, restaurantId: string) {
  return apiRequest<Restaurant>(`/restaurants/${restaurantId}`, { token });
}

export function createRestaurant(
  token: string,
  data: {
    name: string;
    subdomain: string;
    original_language?: string;
    status?: string;
  },
) {
  return apiRequest<Restaurant>("/restaurants", {
    method: "POST",
    token,
    body: data,
  });
}

export function updateRestaurant(
  token: string,
  restaurantId: string,
  data: Partial<Restaurant>,
) {
  return apiRequest<Restaurant>(`/restaurants/${restaurantId}`, {
    method: "PATCH",
    token,
    body: data,
  });
}

export function setSchedules(
  token: string,
  restaurantId: string,
  schedules: ScheduleInput[],
) {
  return apiRequest<void>(`/restaurants/${restaurantId}/schedules`, {
    method: "PUT",
    token,
    body: schedules,
  });
}

export function setPaymentMethods(
  token: string,
  restaurantId: string,
  methods: PaymentMethodInput[],
) {
  return apiRequest<void>(`/restaurants/${restaurantId}/payment-methods`, {
    method: "PUT",
    token,
    body: methods,
  });
}
