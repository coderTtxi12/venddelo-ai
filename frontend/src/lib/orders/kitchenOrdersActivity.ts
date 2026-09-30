type KitchenSocketOpenInput = {
  restaurantId: string | null;
  accessToken: string | null;
};

/**
 * Kitchen must stay connected while the dashboard session is active, even when
 * the browser tab is in the background, so new-order audio alerts are not missed.
 */
export function shouldOpenKitchenOrdersSocket({
  restaurantId,
  accessToken,
}: KitchenSocketOpenInput): boolean {
  return Boolean(restaurantId && accessToken);
}
