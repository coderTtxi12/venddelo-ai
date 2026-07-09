import { createCategory, listCategories, updateCategory } from '@/lib/api/menu';
import { fetchAllPages } from '@/lib/api/pagination';
import { mapCategoryToDraft } from '@/lib/api/mappers';
import { resolveImagePathForUpload } from '@/lib/storage/resolveImagePath';
import type { LegacyDbClient, LegacyStorageClient } from '../legacyDb';
import type { CategoryDraft, ImageDraft } from './supplierCatalogTypes';
import type { PageCursor } from './firestoreTypes';

export const CATEGORIES_PAGE_SIZE = 10;

export type FetchSupplierCategoriesPageArgs = {
  cursor: PageCursor;
};

export type FetchSupplierCategoriesPageResult = {
  items: CategoryDraft[];
  cursor: PageCursor;
  hasMore: boolean;
};

export function mapCategoryDoc(_snap: unknown): CategoryDraft {
  throw new Error('mapCategoryDoc no disponible sin Firebase');
}

export async function fetchSupplierCategoriesPage(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  args: FetchSupplierCategoriesPageArgs,
): Promise<FetchSupplierCategoriesPageResult> {
  const page = await listCategories(
    accessToken,
    restaurantId,
    CATEGORIES_PAGE_SIZE,
    args.cursor,
    { includeInactive: true },
  );

  return {
    items: page.items.map(mapCategoryToDraft),
    cursor: page.next_cursor,
    hasMore: page.has_more,
  };
}

export async function fetchAllSupplierCategories(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
): Promise<CategoryDraft[]> {
  // Match digital menu: fetch in large pages so sort_index ordering is not broken by
  // keyset cursors that only use (created_at, id).
  const rows = await fetchAllPages(
    (cursor) => listCategories(accessToken, restaurantId, 100, cursor, { includeInactive: true }),
    100,
  );
  return rows.map(mapCategoryToDraft);
}

export type SaveSupplierCategoryPayload = {
  id?: string;
  name: string;
  description: string;
  image: ImageDraft | null;
};

async function resolveImagePath(
  accessToken: string,
  restaurantId: string,
  image: ImageDraft | null,
): Promise<string | null | undefined> {
  return resolveImagePathForUpload(accessToken, restaurantId, 'categories', image);
}

export async function saveSupplierCategory(
  accessToken: string,
  _db: LegacyDbClient,
  _storage: LegacyStorageClient,
  restaurantId: string,
  payload: SaveSupplierCategoryPayload,
): Promise<void> {
  const imagePath = await resolveImagePath(accessToken, restaurantId, payload.image);
  const description = payload.description.trim() || null;

  if (payload.id) {
    const body: {
      name: string;
      description: string | null;
      image_path?: string | null;
    } = {
      name: payload.name,
      description,
    };
    if (imagePath !== undefined) {
      body.image_path = imagePath;
    }
    await updateCategory(accessToken, restaurantId, payload.id, body);
    return;
  }

  await createCategory(accessToken, restaurantId, {
    name: payload.name,
    description,
    image_path: imagePath ?? null,
  });
}

export async function updateSupplierCategoryActive(
  accessToken: string,
  _db: LegacyDbClient,
  restaurantId: string,
  categoryId: string,
  isActive: boolean,
): Promise<void> {
  await updateCategory(accessToken, restaurantId, categoryId, { is_active: isActive });
}
