import {
  createOptionGroup,
  createOptionItem,
  createProduct,
  deleteOptionGroup,
  deleteOptionItem,
  getProduct,
  listProducts,
  updateOptionGroup,
  updateOptionItem,
  updateProduct,
  type OptionGroupCreateInput,
  type OptionGroupUpdateInput,
  type OptionItemUpdateInput,
  type ProductListView,
} from '@/lib/api/menu';
import { mapOptionGroupToDraft, mapProductToDraft } from '@/lib/api/mappers';
import type { Product } from '@/lib/api/types';
import type { Promotion } from '@/lib/api/types';
import {
  buildProductCatalogDiscountMap,
  discountUsdFromPromotion,
  isCatalogProductDiscountPromotion,
  syncProductCatalogDiscount,
} from '@/lib/promotions/productCatalogDiscount';
import { resolveImagePathForUpload } from '@/lib/storage/resolveImagePath';
import type { ProductVisibilityState } from '@/lib/menu/productVisibility';
import { visibilityUpdateForState } from '@/lib/menu/productVisibility';
import type { LegacyDbClient, LegacyStorageClient } from '../legacyDb';
import type {
  ImageDraft,
  MoneyUSD,
  OptionGroupDraft,
  ProductDraft,
} from './supplierCatalogTypes';
import type { PageCursor } from './firestoreTypes';

export const PRODUCTS_PAGE_SIZE = 20;

const PERSISTED_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedId(id: string): boolean {
  return PERSISTED_ID_RE.test(id);
}

export function normalizeOptionGroups(groups: OptionGroupDraft[]): OptionGroupDraft[] {
  return groups.map((g) => {
    const activeCount = g.items.filter((item) => item.isActive).length;
    if (g.selection === 'single') {
      return { ...g, maxSelections: 1 };
    }
    if (g.maxSelections == null) return g;
    const cappedMax = activeCount > 0 ? Math.min(g.maxSelections, activeCount) : g.maxSelections;
    return { ...g, maxSelections: Math.max(1, Math.round(cappedMax)) };
  });
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
  catalogPromotions: Promotion[];
};

export async function fetchSupplierProductsPage(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  args: FetchSupplierProductsPageArgs,
  catalogPromotions?: Promotion[],
  options?: { view?: ProductListView },
): Promise<FetchSupplierProductsPageResult> {
  const page = await listProducts(
    accessToken,
    restaurantId,
    PRODUCTS_PAGE_SIZE,
    args.cursor,
    { view: options?.view ?? 'summary' },
  );

  const { discounts, promotions } = await buildProductCatalogDiscountMap(
    accessToken,
    restaurantId,
    page.items,
    catalogPromotions,
  );

  return {
    items: page.items.map((product) =>
      mapProductToDraft(product, discounts.get(product.id) ?? 0),
    ),
    cursor: page.next_cursor,
    hasMore: page.has_more,
    catalogPromotions: promotions,
  };
}

export async function fetchAllSupplierProducts(
  accessToken: string,
  db: LegacyDbClient,
  restaurantId: string,
  options?: { view?: ProductListView },
): Promise<{ items: ProductDraft[]; catalogPromotions: Promotion[] }> {
  const items: ProductDraft[] = [];
  let cursor: PageCursor = null;
  let hasMore = true;
  let catalogPromotions: Promotion[] = [];
  const view = options?.view ?? 'summary';

  while (hasMore) {
    const result = await fetchSupplierProductsPage(
      accessToken,
      db,
      restaurantId,
      { cursor },
      catalogPromotions.length > 0 ? catalogPromotions : undefined,
      { view },
    );
    catalogPromotions = result.catalogPromotions;
    items.push(...result.items);
    cursor = result.cursor;
    hasMore = result.hasMore;
    if (result.items.length === 0) break;
  }

  return { items, catalogPromotions };
}

export async function fetchSupplierProductDetail(
  accessToken: string,
  restaurantId: string,
  productId: string,
  catalogPromotions?: Promotion[],
): Promise<ProductDraft> {
  const product = await getProduct(accessToken, restaurantId, productId);
  const { discounts } = await buildProductCatalogDiscountMap(
    accessToken,
    restaurantId,
    [product],
    catalogPromotions,
  );
  return mapProductToDraft(product, discounts.get(product.id) ?? 0);
}

export type SaveSupplierProductPayload = {
  id?: string;
  name: string;
  description: string;
  price: MoneyUSD;
  discountUsd: number;
  discountMode: 'usd' | 'percent';
  discountPercent: number;
  image: ImageDraft | null;
  categoryIds: string[];
  optionGroups: OptionGroupDraft[];
  /** Estado previo de grupos al editar; evita un GET extra antes de sincronizar. */
  existingOptionGroups?: OptionGroupDraft[];
  catalogPromotions?: Promotion[];
};

export type SaveSupplierProductResult = {
  catalogPromotions: Promotion[];
  product: ProductDraft;
};

function basePriceCents(price: MoneyUSD): number {
  return Math.round(Math.max(0, price.amount) * 100);
}

function mapOptionGroupToCreate(group: OptionGroupDraft, sortIndex: number): OptionGroupCreateInput {
  const items = group.items.filter((item) => item.isActive);
  const activeCount = items.length;
  const minSelections = group.required ? 1 : 0;

  if (group.selection === 'single') {
    return {
      title: group.title,
      required: group.required,
      selection: 'single',
      min_selections: minSelections,
      max_selections: 1,
      sort_index: sortIndex,
      is_active: group.isActive,
      items: items.map((item, index) => ({
        label: item.label,
        price_delta_cents: Math.round(item.priceDeltaUsd * 100),
        sort_index: index,
      })),
    };
  }

  let maxSelections = group.maxSelections;
  if (maxSelections != null) {
    maxSelections = Math.max(1, Math.round(maxSelections));
    if (activeCount > 0) {
      maxSelections = Math.min(maxSelections, activeCount);
    }
    if (minSelections > maxSelections) {
      maxSelections = minSelections;
    }
  }

  return {
    title: group.title,
    required: group.required,
    selection: 'multi',
    min_selections: minSelections,
    max_selections: maxSelections,
    sort_index: sortIndex,
    is_active: group.isActive,
    items: items.map((item, index) => ({
      label: item.label,
      price_delta_cents: Math.round(item.priceDeltaUsd * 100),
      sort_index: index,
    })),
  };
}

function mapOptionGroupToUpdate(group: OptionGroupDraft, sortIndex: number): OptionGroupUpdateInput {
  const { items: _items, ...meta } = mapOptionGroupToCreate(group, sortIndex);
  return meta;
}

function groupMetaChanged(
  group: OptionGroupDraft,
  existing: OptionGroupDraft,
  sortIndex: number,
): boolean {
  const next = mapOptionGroupToUpdate(group, sortIndex);
  const prev = mapOptionGroupToUpdate(existing, sortIndex);
  return (
    next.title !== prev.title ||
    next.required !== prev.required ||
    next.selection !== prev.selection ||
    next.min_selections !== prev.min_selections ||
    next.max_selections !== prev.max_selections ||
    next.sort_index !== prev.sort_index ||
    next.is_active !== prev.is_active
  );
}

function itemPayloadMatches(
  label: string,
  priceDeltaCents: number,
  existing: { label: string; priceDeltaUsd: number },
): boolean {
  return existing.label === label && Math.round(existing.priceDeltaUsd * 100) === priceDeltaCents;
}

async function syncGroupItems(
  accessToken: string,
  restaurantId: string,
  productId: string,
  groupId: string,
  group: OptionGroupDraft,
  existing: OptionGroupDraft,
): Promise<OptionGroupDraft> {
  const activeItems = group.items.filter((item) => item.isActive);
  const keptPersistedIds = new Set<string>();
  const deleteIds: string[] = [];
  const pendingUpdates: Array<{ itemId: string; body: OptionItemUpdateInput }> = [];

  for (const existingItem of existing.items) {
    const draftItem = group.items.find((item) => item.id === existingItem.id);
    if (!draftItem) {
      deleteIds.push(existingItem.id);
      continue;
    }

    const priceDeltaCents = Math.round(draftItem.priceDeltaUsd * 100);

    if (!draftItem.isActive) {
      if (existingItem.isActive) {
        pendingUpdates.push({ itemId: existingItem.id, body: { is_active: false } });
      }
      continue;
    }

    if (!existingItem.isActive) {
      pendingUpdates.push({ itemId: existingItem.id, body: { is_active: true } });
    }

    if (itemPayloadMatches(draftItem.label, priceDeltaCents, existingItem)) {
      keptPersistedIds.add(existingItem.id);
      continue;
    }

    deleteIds.push(existingItem.id);
  }

  type PendingCreate = { label: string; price_delta_cents: number; sort_index: number; draftIndex: number };
  const pendingCreates: PendingCreate[] = [];
  for (const [index, item] of activeItems.entries()) {
    const priceDeltaCents = Math.round(item.priceDeltaUsd * 100);
    if (isPersistedId(item.id) && keptPersistedIds.has(item.id)) {
      continue;
    }
    pendingCreates.push({
      label: item.label,
      price_delta_cents: priceDeltaCents,
      sort_index: index,
      draftIndex: index,
    });
  }

  if (deleteIds.length === 0 && pendingCreates.length === 0 && pendingUpdates.length === 0) {
    return group;
  }

  await Promise.all([
    ...pendingUpdates.map(({ itemId, body }) =>
      updateOptionItem(accessToken, restaurantId, productId, groupId, itemId, body),
    ),
    ...deleteIds.map((itemId) =>
      deleteOptionItem(accessToken, restaurantId, productId, groupId, itemId),
    ),
  ]);

  const createdItems = await Promise.all(
    pendingCreates.map((item) =>
      createOptionItem(accessToken, restaurantId, productId, groupId, {
        label: item.label,
        price_delta_cents: item.price_delta_cents,
        sort_index: item.sort_index,
      }),
    ),
  );

  const inactiveItems = group.items.filter((item) => !item.isActive);
  const rebuiltActive: OptionGroupDraft['items'] = [];
  let createCursor = 0;

  for (const item of activeItems) {
    if (keptPersistedIds.has(item.id)) {
      rebuiltActive.push(item);
      continue;
    }
    const created = createdItems[createCursor++]!;
    rebuiltActive.push({
      id: created.id,
      label: created.label,
      priceDeltaUsd: created.price_delta_cents / 100,
      isActive: true,
    });
  }

  return {
    ...group,
    items: [...rebuiltActive, ...inactiveItems],
  };
}

async function syncProductOptionGroups(
  accessToken: string,
  restaurantId: string,
  productId: string,
  existingGroups: OptionGroupDraft[],
  groups: OptionGroupDraft[],
): Promise<OptionGroupDraft[]> {
  const existingById = new Map(existingGroups.map((group) => [group.id, group]));
  const payloadPersistedIds = new Set(
    groups.filter((group) => isPersistedId(group.id)).map((group) => group.id),
  );

  const removedGroupIds = existingGroups
    .filter((group) => isPersistedId(group.id) && !payloadPersistedIds.has(group.id))
    .map((group) => group.id);

  await Promise.all(
    removedGroupIds.map((groupId) =>
      deleteOptionGroup(accessToken, restaurantId, productId, groupId),
    ),
  );

  return Promise.all(
    groups.map(async (group, index) => {
      if (isPersistedId(group.id) && existingById.has(group.id)) {
        const existing = existingById.get(group.id)!;
        if (groupMetaChanged(group, existing, index)) {
          await updateOptionGroup(
            accessToken,
            restaurantId,
            productId,
            group.id,
            mapOptionGroupToUpdate(group, index),
          );
        }
        return syncGroupItems(accessToken, restaurantId, productId, group.id, group, existing);
      }

      const created = await createOptionGroup(
        accessToken,
        restaurantId,
        productId,
        mapOptionGroupToCreate(group, index),
      );
      return mapOptionGroupToDraft(created);
    }),
  );
}

function discountUsdForProduct(product: Product, promotions: Promotion[]): number {
  const promo = promotions.find((p) => isCatalogProductDiscountPromotion(p, product.id)) ?? null;
  if (!promo) return 0;
  return discountUsdFromPromotion(promo, product.price_cents / 100);
}

function buildSavedProductDraft(
  product: Product,
  optionGroups: OptionGroupDraft[],
  catalogPromotions: Promotion[],
  image: ImageDraft | null,
): ProductDraft {
  const mapped = mapProductToDraft(product, discountUsdForProduct(product, catalogPromotions));
  return {
    ...mapped,
    optionGroups,
    image: image ?? mapped.image,
  };
}

export async function saveSupplierProduct(
  accessToken: string,
  _db: LegacyDbClient,
  _storage: LegacyStorageClient,
  restaurantId: string,
  payload: SaveSupplierProductPayload,
): Promise<SaveSupplierProductResult> {
  const imagePath = await resolveImagePathForUpload(
    accessToken,
    restaurantId,
    'products',
    payload.image,
  );
  const description = payload.description.trim() || null;
  const priceCents = basePriceCents(payload.price);
  const priceUsd = payload.price.amount;
  const discountUsd = Math.max(0, payload.discountUsd ?? 0);
  const discountMode = payload.discountMode === 'percent' ? 'percent' : 'amount';
  const allGroups = normalizeOptionGroups(payload.optionGroups);
  const existingGroups = payload.existingOptionGroups ?? [];
  const cachedPromotions = payload.catalogPromotions;

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

    const [updatedProduct, syncedGroups, catalogPromotions] = await Promise.all([
      updateProduct(accessToken, restaurantId, payload.id, body),
      syncProductOptionGroups(
        accessToken,
        restaurantId,
        payload.id,
        existingGroups,
        allGroups,
      ),
      syncProductCatalogDiscount(
        accessToken,
        restaurantId,
        payload.id,
        payload.name,
        priceUsd,
        discountUsd,
        discountMode,
        payload.discountPercent,
        cachedPromotions,
      ),
    ]);

    return {
      catalogPromotions,
      product: buildSavedProductDraft(
        updatedProduct,
        syncedGroups,
        catalogPromotions,
        payload.image,
      ),
    };
  }

  const product = await createProduct(accessToken, restaurantId, {
    name: payload.name,
    description,
    price_cents: priceCents,
    category_ids: payload.categoryIds,
    image_path: imagePath ?? null,
  });

  const [syncedGroups, catalogPromotions] = await Promise.all([
    Promise.all(
      allGroups.map((group, index) =>
        createOptionGroup(
          accessToken,
          restaurantId,
          product.id,
          mapOptionGroupToCreate(group, index),
        ).then(mapOptionGroupToDraft),
      ),
    ),
    syncProductCatalogDiscount(
      accessToken,
      restaurantId,
      product.id,
      payload.name,
      priceUsd,
      discountUsd,
      discountMode,
      payload.discountPercent,
      cachedPromotions,
    ),
  ]);

  return {
    catalogPromotions,
    product: buildSavedProductDraft(product, syncedGroups, catalogPromotions, payload.image),
  };
}

export async function updateSupplierProductVisibility(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  productId: string,
  state: ProductVisibilityState,
): Promise<void> {
  const patch = visibilityUpdateForState(state);
  await updateProduct(accessToken, restaurantId, productId, patch);
}

export async function updateSupplierProductActive(
  accessToken: string,
  db: LegacyDbClient,
  restaurantId: string,
  productId: string,
  isActive: boolean,
): Promise<void> {
  await updateSupplierProductVisibility(
    accessToken,
    db,
    restaurantId,
    productId,
    isActive ? 'live' : 'inactive',
  );
}

export async function updateSupplierProductReviewStatus(
  _db: LegacyDbClient,
  _supplierId: string,
  _productId: string,
  _status: 'draft' | 'pending_review',
): Promise<void> {
  throw new Error('Revisión de productos pendiente de migración al API backend.');
}
