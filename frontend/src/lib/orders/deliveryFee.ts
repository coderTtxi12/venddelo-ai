/** Customer-payable delivery after free-shipping waiver. */
export function customerPayableDeliveryCents(
  deliveryFeeCents: number,
  waivedCents: number,
): number {
  return Math.max(0, deliveryFeeCents - Math.max(0, waivedCents));
}

/**
 * B2B / provider delivery fee for dispatch lock.
 * Falls back to waived amount for legacy orders that zeroed delivery_fee_cents.
 */
export function providerDeliveryFeeCents(
  deliveryFeeCents: number,
  waivedCents: number,
): number {
  if (deliveryFeeCents > 0) return deliveryFeeCents;
  if (waivedCents > 0) return waivedCents;
  return 0;
}
