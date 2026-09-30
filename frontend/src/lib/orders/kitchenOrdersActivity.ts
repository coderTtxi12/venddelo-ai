type KitchenSocketOpenInput = {
  restaurantId: string | null;
  accessToken: string | null;
  visibilityState: DocumentVisibilityState;
};

export function shouldOpenKitchenOrdersSocket({
  restaurantId,
  accessToken,
  visibilityState,
}: KitchenSocketOpenInput): boolean {
  return Boolean(restaurantId && accessToken && visibilityState === 'visible');
}
