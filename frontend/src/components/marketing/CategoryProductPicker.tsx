'use client';

import ExpandLessOutlinedIcon from '@mui/icons-material/ExpandLessOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Product } from '@/lib/api/types';
import styles from '../pages/MarketingPage.module.css';

type CategoryGroup = {
  category: Category | null;
  products: Product[];
};

type CategoryProductPickerProps = {
  categories: Category[];
  products: Product[];
  categoryIds: string[];
  productIds: string[];
  onSelectionChange: (categoryIds: string[], productIds: string[]) => void;
  headerLabel?: string;
  helpText?: string;
  searchPlaceholder?: string;
  searchInputId?: string;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function buildCategoryGroups(categories: Category[], products: Product[]): CategoryGroup[] {
  const sortedCategories = [...categories].sort((a, b) => a.sort_index - b.sort_index);
  const categoryIdSet = new Set(categories.map((c) => c.id));

  const groups: CategoryGroup[] = sortedCategories.map((category) => ({
    category,
    products: products
      .filter((p) => p.category_ids.includes(category.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  }));

  const uncategorized = products
    .filter(
      (p) =>
        p.category_ids.length === 0 ||
        !p.category_ids.some((categoryId) => categoryIdSet.has(categoryId)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  if (uncategorized.length > 0) {
    groups.push({ category: null, products: uncategorized });
  }

  return groups.filter((g) => g.products.length > 0 || g.category);
}

function groupKey(group: CategoryGroup): string {
  return group.category?.id ?? '__uncategorized__';
}

function groupLabel(group: CategoryGroup): string {
  return group.category?.name ?? 'Sin categoría';
}

function isCategoryFullySelected(categoryId: string, categoryIds: string[]): boolean {
  return categoryIds.includes(categoryId);
}

function isProductChecked(
  product: Product,
  categoryIds: string[],
  productIds: string[],
): boolean {
  if (product.category_ids.some((categoryId) => categoryIds.includes(categoryId))) return true;
  return productIds.includes(product.id);
}

function categorySelectionState(
  group: CategoryGroup,
  categoryIds: string[],
  productIds: string[],
): 'none' | 'partial' | 'full' {
  if (!group.category) {
    const selected = group.products.filter((p) => productIds.includes(p.id)).length;
    if (selected === 0) return 'none';
    if (selected === group.products.length) return 'full';
    return 'partial';
  }

  if (isCategoryFullySelected(group.category.id, categoryIds)) return 'full';

  const selected = group.products.filter((p) => productIds.includes(p.id)).length;
  if (selected === 0) return 'none';
  if (selected === group.products.length) return 'full';
  return 'partial';
}

function toggleCategory(
  group: CategoryGroup,
  categoryIds: string[],
  productIds: string[],
  products: Product[],
): { categoryIds: string[]; productIds: string[] } {
  if (!group.category) {
    const allSelected = group.products.every((p) => productIds.includes(p.id));
    if (allSelected) {
      const removed = group.products.map((p) => p.id);
      return {
        categoryIds,
        productIds: productIds.filter((id) => !removed.includes(id)),
      };
    }
    const next = [...new Set([...productIds, ...group.products.map((p) => p.id)])];
    return { categoryIds, productIds: next };
  }

  const categoryId = group.category.id;
  const catProductIds = products
    .filter((p) => p.category_ids.includes(categoryId))
    .map((p) => p.id);

  if (isCategoryFullySelected(categoryId, categoryIds)) {
    return {
      categoryIds: categoryIds.filter((id) => id !== categoryId),
      productIds,
    };
  }

  return {
    categoryIds: [...categoryIds, categoryId],
    productIds: productIds.filter((id) => !catProductIds.includes(id)),
  };
}

function toggleProduct(
  product: Product,
  categoryIds: string[],
  productIds: string[],
  products: Product[],
): { categoryIds: string[]; productIds: string[] } {
  const fullCategoryId = product.category_ids.find((categoryId) =>
    categoryIds.includes(categoryId),
  );

  if (fullCategoryId) {
    const catProducts = products.filter((p) => p.category_ids.includes(fullCategoryId));
    const nextProductIds = [
      ...new Set([
        ...productIds,
        ...catProducts.filter((p) => p.id !== product.id).map((p) => p.id),
      ]),
    ];
    return {
      categoryIds: categoryIds.filter((id) => id !== fullCategoryId),
      productIds: nextProductIds,
    };
  }

  if (productIds.includes(product.id)) {
    return {
      categoryIds,
      productIds: productIds.filter((id) => id !== product.id),
    };
  }

  const nextProductIds = [...productIds, product.id];

  for (const categoryId of product.category_ids) {
    const catProducts = products.filter((p) => p.category_ids.includes(categoryId));
    if (catProducts.length > 0 && catProducts.every((p) => nextProductIds.includes(p.id))) {
      return {
        categoryIds: [...categoryIds, categoryId],
        productIds: nextProductIds.filter((id) => !catProducts.some((p) => p.id === id)),
      };
    }
  }

  return { categoryIds, productIds: nextProductIds };
}

export function CategoryProductPicker({
  categories,
  products,
  categoryIds,
  productIds,
  onSelectionChange,
  headerLabel = 'Categorías incluidas',
  helpText = 'Selecciona categorías completas o expande una para elegir productos específicos.',
  searchPlaceholder = 'Buscar categoría o producto…',
  searchInputId = 'promo-category-search',
}: CategoryProductPickerProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const categoryCheckboxRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const groups = useMemo(() => buildCategoryGroups(categories, products), [categories, products]);

  const filteredGroups = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return groups;

    return groups
      .map((group) => {
        const label = groupLabel(group);
        const categoryMatches = label.toLowerCase().includes(q);
        const matchingProducts = group.products.filter((p) => p.name.toLowerCase().includes(q));

        if (categoryMatches) return group;
        if (matchingProducts.length > 0) return { ...group, products: matchingProducts };
        return null;
      })
      .filter((group): group is CategoryGroup => group !== null);
  }, [groups, search]);

  const searchActive = normalizeText(search).length > 0;

  useEffect(() => {
    if (!searchActive) return;
    setExpanded(new Set(filteredGroups.map((g) => groupKey(g))));
  }, [filteredGroups, searchActive]);

  useEffect(() => {
    for (const group of filteredGroups) {
      if (!group.category) continue;
      const key = groupKey(group);
      const el = categoryCheckboxRefs.current.get(key);
      if (!el) continue;
      const state = categorySelectionState(group, categoryIds, productIds);
      el.indeterminate = state === 'partial';
    }
  }, [filteredGroups, categoryIds, productIds]);

  const selectionCount = useMemo(() => {
    const categoryCount = categoryIds.length;
    const productCount = productIds.length;
    const parts: string[] = [];
    if (categoryCount > 0) {
      parts.push(`${categoryCount} categoría${categoryCount === 1 ? '' : 's'}`);
    }
    if (productCount > 0) {
      parts.push(`${productCount} producto${productCount === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  }, [categoryIds, productIds]);

  const applySelectionChange = (next: { categoryIds: string[]; productIds: string[] }) => {
    onSelectionChange(next.categoryIds, next.productIds);
  };

  if (categories.length === 0 && products.length === 0) {
    return <p className={styles.helpText}>No hay categorías ni productos disponibles.</p>;
  }

  return (
    <div className={styles.menuPicker}>
      <div className={styles.menuPickerHeader}>
        <span className={styles.label}>{headerLabel}</span>
        {selectionCount ? (
          <span className={styles.menuPickerCount}>{selectionCount}</span>
        ) : null}
      </div>

      <p className={styles.helpText}>{helpText}</p>

      <div className={styles.searchField}>
        <SearchOutlinedIcon className={styles.searchIcon} fontSize="small" aria-hidden />
        <input
          id={searchInputId}
          className={styles.searchInput}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className={styles.menuPickerEmpty}>
          <p className={styles.menuPickerEmptyTitle}>Sin coincidencias</p>
          <p className={styles.helpText}>
            Prueba con otro término o borra la búsqueda para ver todo el menú.
          </p>
        </div>
      ) : (
        <div className={styles.menuPickerList} role="tree" aria-label="Categorías y productos">
          {filteredGroups.map((group) => {
            const key = groupKey(group);
            const isExpanded = searchActive || expanded.has(key);
            const selection = categorySelectionState(group, categoryIds, productIds);
            const hasProducts = group.products.length > 0;

            return (
              <div key={key} className={styles.menuPickerGroup} role="treeitem" aria-expanded={isExpanded}>
                <div className={styles.menuPickerGroupRow}>
                  <label className={styles.menuPickerCategoryLabel}>
                    <input
                      ref={(el) => {
                        if (el) categoryCheckboxRefs.current.set(key, el);
                        else categoryCheckboxRefs.current.delete(key);
                      }}
                      type="checkbox"
                      checked={selection === 'full'}
                      onChange={() =>
                        applySelectionChange(
                          toggleCategory(group, categoryIds, productIds, products),
                        )
                      }
                    />
                    <span className={styles.menuPickerCategoryName}>{groupLabel(group)}</span>
                    {hasProducts ? (
                      <span className={styles.menuPickerMeta}>
                        {group.products.length} producto{group.products.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </label>

                  {hasProducts ? (
                    <button
                      type="button"
                      className={styles.menuPickerExpandBtn}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Ocultar productos de ${groupLabel(group)}`
                          : `Ver productos de ${groupLabel(group)}`
                      }
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      {isExpanded ? (
                        <ExpandLessOutlinedIcon fontSize="small" />
                      ) : (
                        <ExpandMoreOutlinedIcon fontSize="small" />
                      )}
                    </button>
                  ) : null}
                </div>

                {hasProducts && isExpanded ? (
                  <div className={styles.menuPickerProducts} role="group">
                    {group.products.map((product) => (
                      <label key={product.id} className={styles.menuPickerProductLabel}>
                        <input
                          type="checkbox"
                          checked={isProductChecked(product, categoryIds, productIds)}
                          onChange={() =>
                            applySelectionChange(
                              toggleProduct(product, categoryIds, productIds, products),
                            )
                          }
                        />
                        <span>{product.name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function deriveMenuScope(categoryIds: string[], productIds: string[]): 'product' | 'category' {
  if (categoryIds.length > 0 && productIds.length === 0) return 'category';
  return 'product';
}

export function normalizeCategorySelection(
  categoryIds: string[],
  productIds: string[],
  products: Product[],
): { scope: 'product' | 'category'; categoryIds: string[]; productIds: string[] } {
  const scope = deriveMenuScope(categoryIds, productIds);
  if (scope === 'category') {
    return { scope, categoryIds, productIds: [] };
  }

  const allProductIds = new Set(productIds);
  for (const categoryId of categoryIds) {
    for (const product of products) {
      if (product.category_ids.includes(categoryId)) {
        allProductIds.add(product.id);
      }
    }
  }

  return {
    scope: 'product',
    categoryIds: [],
    productIds: [...allProductIds],
  };
}

export function hasMenuSelection(categoryIds: string[], productIds: string[]): boolean {
  return categoryIds.length > 0 || productIds.length > 0;
}

export function menuEligibleProducts(
  products: Product[],
  categoryIds: string[],
  productIds: string[],
): Product[] {
  return products.filter(
    (p) =>
      productIds.includes(p.id) ||
      p.category_ids.some((categoryId) => categoryIds.includes(categoryId)),
  );
}
