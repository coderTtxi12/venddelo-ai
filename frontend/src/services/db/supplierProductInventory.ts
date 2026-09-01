import { updateProduct } from '@/lib/api/menu';
import { mapProductToDraft } from '@/lib/api/mappers';
import type { ProductDraft } from './supplierCatalogTypes';

export type PatchSupplierProductInventoryPayload = {
  inventoryQty?: number | null;
  expiresOn?: string | null;
  shelfLifeDays?: number | null;
};

export async function patchSupplierProductInventory(
  accessToken: string,
  restaurantId: string,
  productId: string,
  payload: PatchSupplierProductInventoryPayload,
): Promise<ProductDraft> {
  const product = await updateProduct(accessToken, restaurantId, productId, {
    ...(payload.inventoryQty !== undefined ? { inventory_qty: payload.inventoryQty } : {}),
    ...(payload.expiresOn !== undefined ? { expires_on: payload.expiresOn } : {}),
    ...(payload.shelfLifeDays !== undefined ? { shelf_life_days: payload.shelfLifeDays } : {}),
  });
  return mapProductToDraft(product);
}
