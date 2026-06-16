import { listProducts } from '@/lib/api/menu';
import { mapProductToDraft } from '@/lib/api/mappers';
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

export async function saveSupplierProduct(
  _db: LegacyDbClient,
  _storage: LegacyStorageClient,
  _supplierId: string,
  _payload: SaveSupplierProductPayload,
): Promise<void> {
  throw new Error('Guardado de productos pendiente de migración al API backend.');
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
