import {
  createOptionGroup,
  createProduct,
  deleteOptionGroup,
  getProduct,
  listProducts,
  updateProduct,
  type OptionGroupCreateInput,
} from '@/lib/api/menu';
import { mapProductToDraft } from '@/lib/api/mappers';
import { resolveImagePathForUpload } from '@/lib/storage/resolveImagePath';
import type { LegacyDbClient, LegacyStorageClient } from '../legacyDb';
import type {
  ImageDraft,
  MoneyUSD,
  OptionGroupDraft,
  ProductDraft,
} from './supplierCatalogTypes';
import type { PageCursor } from './firestoreTypes';

export const PRODUCTS_PAGE_SIZE = 20;

export function normalizeOptionGroups(groups: OptionGroupDraft[]): OptionGroupDraft[] {
  return groups.map((g) =>
    g.required && g.selection !== 'single' ? { ...g, selection: 'single' } : g,
  );
}

export function mapProductDoc(_snap: unknown): ProductDraft {
  throw new Error('mapProductDoc no disponible sin Firebase');
}

export type FetchSupplierProductsPageArgs = {
  cursor: PageCursor;
};

export type FetchSupplierProductsPageResult = {
  items: ProductDraft[];
  cursor: PageCursor;
  hasMore: boolean;
};

export async function fetchSupplierProductsPage(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  args: FetchSupplierProductsPageArgs,
): Promise<FetchSupplierProductsPageResult> {
  const page = await listProducts(
    accessToken,
    restaurantId,
    PRODUCTS_PAGE_SIZE,
    args.cursor,
  );

  return {
    items: page.items.map(mapProductToDraft),
    cursor: page.next_cursor,
    hasMore: page.has_more,
  };
}

export type SaveSupplierProductPayload = {
  id?: string;
  name: string;
  description: string;
  price: MoneyUSD;
  discountUsd: number;
  image: ImageDraft | null;
  categoryIds: string[];
  optionGroups: OptionGroupDraft[];
};

function priceCentsFromPayload(price: MoneyUSD, discountUsd: number): number {
  const finalUsd = Math.max(0, price.amount - (discountUsd ?? 0));
  return Math.round(finalUsd * 100);
}

function mapOptionGroupToCreate(group: OptionGroupDraft): OptionGroupCreateInput {
  const items = group.items.filter((item) => item.isActive);
  return {
    title: group.title,
    required: group.required,
    selection: group.selection,
    min_selections: group.required ? 1 : 0,
    max_selections: group.selection === 'single' ? 1 : null,
    sort_index: 0,
    items: items.map((item, index) => ({
      label: item.label,
      price_delta_cents: Math.round(item.priceDeltaUsd * 100),
      sort_index: index,
    })),
  };
}

async function syncProductOptionGroups(
  accessToken: string,
  restaurantId: string,
  productId: string,
  groups: OptionGroupDraft[],
): Promise<void> {
  const existing = await getProduct(accessToken, restaurantId, productId);
  for (const group of existing.option_groups) {
    await deleteOptionGroup(accessToken, restaurantId, productId, group.id);
  }
  for (const group of groups) {
    await createOptionGroup(
      accessToken,
      restaurantId,
      productId,
      mapOptionGroupToCreate(group),
    );
  }
}

export async function saveSupplierProduct(
  accessToken: string,
  _db: LegacyDbClient,
  _storage: LegacyStorageClient,
  restaurantId: string,
  payload: SaveSupplierProductPayload,
): Promise<void> {
  const imagePath = await resolveImagePathForUpload(
    accessToken,
    restaurantId,
    'products',
    payload.image,
  );
  const description = payload.description.trim() || null;
  const priceCents = priceCentsFromPayload(payload.price, payload.discountUsd);
  const activeGroups = normalizeOptionGroups(payload.optionGroups).filter((g) => g.isActive);

  if (payload.id) {
    const body: {
      name: string;
      description: string | null;
      price_cents: number;
      category_ids: string[];
      image_path?: string | null;
    } = {
      name: payload.name,
      description,
      price_cents: priceCents,
      category_ids: payload.categoryIds,
    };
    if (imagePath !== undefined) {
      body.image_path = imagePath;
    }
    await updateProduct(accessToken, restaurantId, payload.id, body);
    await syncProductOptionGroups(accessToken, restaurantId, payload.id, activeGroups);
    return;
  }

  const product = await createProduct(accessToken, restaurantId, {
    name: payload.name,
    description,
    price_cents: priceCents,
    category_ids: payload.categoryIds,
    image_path: imagePath ?? null,
  });

  for (const group of activeGroups) {
    await createOptionGroup(
      accessToken,
      restaurantId,
      product.id,
      mapOptionGroupToCreate(group),
    );
  }
}

export async function updateSupplierProductActive(
  _db: LegacyDbClient,
  _supplierId: string,
  _productId: string,
  _isActive: boolean,
): Promise<void> {
  throw new Error('Actualización de productos pendiente de migración al API backend.');
}

export async function updateSupplierProductReviewStatus(
  _db: LegacyDbClient,
  _supplierId: string,
  _productId: string,
  _status: 'draft' | 'pending_review',
): Promise<void> {
  throw new Error('Revisión de productos pendiente de migración al API backend.');
}
