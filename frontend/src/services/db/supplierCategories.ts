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
  _db: LegacyDbClient,
  _supplierId: string,
  _args: FetchSupplierCategoriesPageArgs,
): Promise<FetchSupplierCategoriesPageResult> {
  return { items: [], cursor: null, hasMore: false };
}

export type SaveSupplierCategoryPayload = {
  id?: string;
  name: string;
  description: string;
  image: ImageDraft | null;
};

export async function saveSupplierCategory(
  _db: LegacyDbClient,
  _storage: LegacyStorageClient,
  _supplierId: string,
  _payload: SaveSupplierCategoryPayload,
): Promise<void> {
  throw new Error('Guardado de categorías pendiente de migración al API backend.');
}

export async function updateSupplierCategoryActive(
  _db: LegacyDbClient,
  _supplierId: string,
  _categoryId: string,
  _isActive: boolean,
): Promise<void> {
  throw new Error('Actualización de categorías pendiente de migración al API backend.');
}
