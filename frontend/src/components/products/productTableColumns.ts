export const PRODUCT_TABLE_COLUMN_STORAGE_KEY = 'venddelo.products.table.columns.v1';

export const PRODUCT_TABLE_COLUMN_IDS = [
  'select',
  'product',
  'categories',
  'price',
  'discount',
  'total',
  'stock',
  'expiry',
  'status',
  'actions',
] as const;

export type ProductTableColumnId = (typeof PRODUCT_TABLE_COLUMN_IDS)[number];

export type ProductTableColumnVisibility = Record<ProductTableColumnId, boolean>;

export const LOCKED_PRODUCT_TABLE_COLUMNS: readonly ProductTableColumnId[] = ['product'];

export const OPTIONAL_PRODUCT_TABLE_COLUMNS = PRODUCT_TABLE_COLUMN_IDS.filter(
  (id) => !LOCKED_PRODUCT_TABLE_COLUMNS.includes(id),
);

export const PRODUCT_TABLE_COLUMN_LABELS: Record<ProductTableColumnId, string> = {
  select: 'Selección',
  product: 'Producto',
  categories: 'Categorías',
  price: 'Precio',
  discount: 'Descuento',
  total: 'Total',
  stock: 'Stock',
  expiry: 'Caducidad',
  status: 'Estado',
  actions: 'Acciones',
};

export const DEFAULT_PRODUCT_TABLE_COLUMNS: ProductTableColumnVisibility = {
  select: false,
  product: true,
  categories: true,
  price: true,
  discount: true,
  total: true,
  stock: true,
  expiry: false,
  status: true,
  actions: true,
};

export function isLockedProductTableColumn(id: ProductTableColumnId): boolean {
  return LOCKED_PRODUCT_TABLE_COLUMNS.includes(id);
}

export function parseProductTableColumns(raw: unknown): ProductTableColumnVisibility {
  const next: ProductTableColumnVisibility = { ...DEFAULT_PRODUCT_TABLE_COLUMNS };
  if (!raw || typeof raw !== 'object') {
    next.product = true;
    return next;
  }
  const record = raw as Record<string, unknown>;
  for (const id of OPTIONAL_PRODUCT_TABLE_COLUMNS) {
    if (typeof record[id] === 'boolean') {
      next[id] = record[id];
    }
  }
  next.product = true;
  return next;
}

export function productTableColumnsMatchDefaults(
  visibility: ProductTableColumnVisibility,
): boolean {
  return PRODUCT_TABLE_COLUMN_IDS.every(
    (id) => visibility[id] === DEFAULT_PRODUCT_TABLE_COLUMNS[id],
  );
}

export function productTableColSpan(visibility: ProductTableColumnVisibility): number {
  return PRODUCT_TABLE_COLUMN_IDS.filter((id) => visibility[id]).length;
}

export function toggleProductTableColumn(
  visibility: ProductTableColumnVisibility,
  id: ProductTableColumnId,
): ProductTableColumnVisibility {
  if (isLockedProductTableColumn(id)) {
    return { ...visibility, product: true };
  }
  return { ...visibility, [id]: !visibility[id], product: true };
}

export function loadProductTableColumns(
  storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): ProductTableColumnVisibility {
  if (!storage) return { ...DEFAULT_PRODUCT_TABLE_COLUMNS };
  try {
    const raw = storage.getItem(PRODUCT_TABLE_COLUMN_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRODUCT_TABLE_COLUMNS };
    return parseProductTableColumns(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PRODUCT_TABLE_COLUMNS };
  }
}

export function saveProductTableColumns(
  visibility: ProductTableColumnVisibility,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): ProductTableColumnVisibility {
  const next = parseProductTableColumns(visibility);
  if (!storage) return next;
  try {
    storage.setItem(PRODUCT_TABLE_COLUMN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures; the in-memory choice still applies.
  }
  return next;
}
