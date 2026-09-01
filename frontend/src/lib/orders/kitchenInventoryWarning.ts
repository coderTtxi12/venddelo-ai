export type KitchenInventoryLine = {
  product_id: string | null;
  quantity: number;
  product_name: string;
};

export type KitchenInventoryProduct = {
  name: string;
  inventory_qty?: number | null;
};

export type KitchenInventoryShortfall = {
  productName: string;
  requested: number;
  available: number;
};

export function kitchenInventoryShortfalls(
  items: readonly KitchenInventoryLine[],
  productsById: ReadonlyMap<string, KitchenInventoryProduct>,
): KitchenInventoryShortfall[] {
  const requestedByProduct = new Map<string, { name: string; requested: number }>();
  for (const item of items) {
    if (!item.product_id || item.quantity < 1) continue;
    const current = requestedByProduct.get(item.product_id);
    if (current) {
      current.requested += item.quantity;
      continue;
    }
    requestedByProduct.set(item.product_id, {
      name: item.product_name,
      requested: item.quantity,
    });
  }

  const shortfalls: KitchenInventoryShortfall[] = [];
  for (const [productId, line] of requestedByProduct) {
    const product = productsById.get(productId);
    if (!product || product.inventory_qty == null) continue;
    if (product.inventory_qty >= line.requested) continue;
    shortfalls.push({
      productName: product.name || line.name,
      requested: line.requested,
      available: product.inventory_qty,
    });
  }
  return shortfalls;
}

export function formatKitchenInventoryBanner(
  shortfalls: readonly KitchenInventoryShortfall[],
): string {
  if (shortfalls.length === 0) return '';
  const names = shortfalls.map((item) => item.productName).join(', ');
  return `Stock corto: no alcanza para ${names}. Puedes confirmar igual.`;
}

export function formatKitchenInventoryDialogBody(
  shortfalls: readonly KitchenInventoryShortfall[],
): string {
  const lines = shortfalls.map(
    (item) => `• ${item.productName} — piden ${item.requested}, hay ${item.available}`,
  );
  return [
    'Puedes confirmar el pedido igual. El inventario de estos productos quedará en 0.',
    '',
    ...lines,
  ].join('\n');
}
