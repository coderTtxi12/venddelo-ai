export function restaurantCollectFromCustomerTotal(
  totalCents: number,
  deliveryFeeCents: number,
): number {
  return totalCents - deliveryFeeCents;
}

export function isValidRestaurantCollect(collectCents: number): boolean {
  return Number.isInteger(collectCents) && collectCents > 0;
}
