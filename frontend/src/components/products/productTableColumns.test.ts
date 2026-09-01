import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_TABLE_COLUMNS,
  loadProductTableColumns,
  parseProductTableColumns,
  productTableColSpan,
  productTableColumnsMatchDefaults,
  saveProductTableColumns,
  toggleProductTableColumn,
} from './productTableColumns';

describe('parseProductTableColumns', () => {
  it('hides caducidad and selección, and keeps product visible by default', () => {
    expect(DEFAULT_PRODUCT_TABLE_COLUMNS.expiry).toBe(false);
    expect(DEFAULT_PRODUCT_TABLE_COLUMNS.select).toBe(false);
    expect(DEFAULT_PRODUCT_TABLE_COLUMNS.actions).toBe(true);
    expect(DEFAULT_PRODUCT_TABLE_COLUMNS.product).toBe(true);
    expect(parseProductTableColumns(null).expiry).toBe(false);
    expect(parseProductTableColumns(null).select).toBe(false);
    expect(parseProductTableColumns(undefined).product).toBe(true);
  });

  it('keeps product visible even if storage tries to hide it', () => {
    expect(parseProductTableColumns({ product: false, expiry: true }).product).toBe(true);
    expect(parseProductTableColumns({ product: false, expiry: true }).expiry).toBe(true);
  });

  it('ignores unknown keys and non-boolean values', () => {
    expect(
      parseProductTableColumns({
        expiry: 'yes',
        stock: false,
        extra: true,
      }),
    ).toEqual({
      ...DEFAULT_PRODUCT_TABLE_COLUMNS,
      stock: false,
    });
  });
});

describe('toggleProductTableColumn', () => {
  it('does not hide product', () => {
    const next = toggleProductTableColumn(DEFAULT_PRODUCT_TABLE_COLUMNS, 'product');
    expect(next.product).toBe(true);
  });

  it('toggles caducidad on and off', () => {
    const shown = toggleProductTableColumn(DEFAULT_PRODUCT_TABLE_COLUMNS, 'expiry');
    expect(shown.expiry).toBe(true);
    expect(toggleProductTableColumn(shown, 'expiry').expiry).toBe(false);
  });

  it('toggles selección on from the hidden default', () => {
    const shown = toggleProductTableColumn(DEFAULT_PRODUCT_TABLE_COLUMNS, 'select');
    expect(shown.select).toBe(true);
    expect(toggleProductTableColumn(shown, 'select').select).toBe(false);
  });
});

describe('productTableColSpan', () => {
  it('counts every visible column, including optional select and actions', () => {
    expect(productTableColSpan(DEFAULT_PRODUCT_TABLE_COLUMNS)).toBe(8);
    expect(
      productTableColSpan({
        ...DEFAULT_PRODUCT_TABLE_COLUMNS,
        select: true,
        expiry: true,
      }),
    ).toBe(10);
    expect(
      productTableColSpan({
        ...DEFAULT_PRODUCT_TABLE_COLUMNS,
        select: false,
        categories: false,
        price: false,
        discount: false,
        total: false,
        stock: false,
        expiry: false,
        status: false,
        actions: false,
      }),
    ).toBe(1);
  });
});

describe('product table column storage', () => {
  it('round-trips a custom selection', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const saved = saveProductTableColumns(
      { ...DEFAULT_PRODUCT_TABLE_COLUMNS, expiry: true, discount: false },
      storage,
    );
    expect(saved.expiry).toBe(true);
    expect(loadProductTableColumns(storage)).toEqual(saved);
    expect(productTableColumnsMatchDefaults(saved)).toBe(false);
  });

  it('falls back to defaults on invalid json', () => {
    const storage = {
      getItem: () => '{not-json',
    };
    expect(loadProductTableColumns(storage)).toEqual(DEFAULT_PRODUCT_TABLE_COLUMNS);
  });
});
