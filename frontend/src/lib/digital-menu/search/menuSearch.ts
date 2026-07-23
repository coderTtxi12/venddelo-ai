import type { Category, Product } from '@/lib/api/types';
import { isDigitalMenuSpecialCategoryId } from '@/lib/digital-menu/specialCategories';
import { isPublicMenuListed } from '@/lib/menu/productVisibility';

export type MenuSearchHitKind = 'product' | 'category';

export type MenuSearchHit = {
  id: string;
  kind: MenuSearchHitKind;
  title: string;
  subtitle?: string;
  matchLabels: string[];
  score: number;
  product?: Product;
  category?: Category;
};

export type MenuSearchInput = {
  query: string;
  products: Product[];
  categories: Category[];
};

const MATCH_LABELS = {
  name: 'Nombre',
  description: 'Descripción',
  complement: 'Complemento',
  category: 'Categoría',
} as const;

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokenizeQuery(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function textMatchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const normalized = normalizeSearchText(haystack);
  return tokens.every((token) => normalized.includes(token));
}

function scoreTextMatch(haystack: string, tokens: string[]): number {
  const normalized = normalizeSearchText(haystack);
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (normalized === token) {
      score += 100;
    } else if (normalized.startsWith(token)) {
      score += 60;
    } else if (normalized.includes(token)) {
      score += 30;
    }
  }
  return score;
}

function searchProducts(products: Product[], tokens: string[]): MenuSearchHit[] {
  const hits: MenuSearchHit[] = [];

  for (const product of products) {
    const matchLabels = new Set<string>();
    let score = 0;

    if (textMatchesTokens(product.name, tokens)) {
      matchLabels.add(MATCH_LABELS.name);
      score += scoreTextMatch(product.name, tokens) * 2;
    }

    if (product.description && textMatchesTokens(product.description, tokens)) {
      matchLabels.add(MATCH_LABELS.description);
      score += scoreTextMatch(product.description, tokens);
    }

    for (const group of product.option_groups) {
      if (!group.is_active) continue;

      if (textMatchesTokens(group.title, tokens)) {
        matchLabels.add(MATCH_LABELS.complement);
        score += scoreTextMatch(group.title, tokens);
      }

      for (const item of group.items) {
        if (!item.is_active) continue;
        if (textMatchesTokens(item.label, tokens)) {
          matchLabels.add(MATCH_LABELS.complement);
          score += scoreTextMatch(item.label, tokens);
        }
      }
    }

    if (matchLabels.size === 0) continue;

    hits.push({
      id: `product:${product.id}`,
      kind: 'product',
      title: product.name,
      subtitle: product.description?.trim() || undefined,
      matchLabels: Array.from(matchLabels),
      score,
      product,
    });
  }

  return hits;
}

export function activeMenuSearchCategories(categories: Category[]): Category[] {
  return categories.filter((category) => category.is_active);
}

function activeMenuSearchCategoryIds(categories: Category[]): Set<string> {
  return new Set(
    activeMenuSearchCategories(categories)
      .filter((category) => !isDigitalMenuSpecialCategoryId(category.id))
      .map((category) => category.id),
  );
}

/** En menú / Inactivo, with at least one active (non-virtual) category. */
export function filterMenuSearchProducts(products: Product[], categories: Category[]): Product[] {
  const activeCategoryIds = activeMenuSearchCategoryIds(categories);
  return products.filter(
    (product) =>
      isPublicMenuListed(product) &&
      product.category_ids.some((categoryId) => activeCategoryIds.has(categoryId)),
  );
}

function searchCategories(categories: Category[], tokens: string[]): MenuSearchHit[] {
  const hits: MenuSearchHit[] = [];

  for (const category of activeMenuSearchCategories(categories)) {
    if (!textMatchesTokens(category.name, tokens)) continue;

    hits.push({
      id: `category:${category.id}`,
      kind: 'category',
      title: category.name,
      subtitle: 'Categoría',
      matchLabels: [MATCH_LABELS.category],
      score: scoreTextMatch(category.name, tokens) * 1.2,
      category,
    });
  }

  return hits;
}

export function searchMenu(input: MenuSearchInput): MenuSearchHit[] {
  const tokens = tokenizeQuery(input.query);
  if (tokens.length === 0) return [];

  const searchableProducts = filterMenuSearchProducts(input.products, input.categories);
  const productHits = searchProducts(searchableProducts, tokens);
  const categoryHits = searchCategories(input.categories, tokens);

  const deduped = new Map<string, MenuSearchHit>();

  for (const hit of [...productHits, ...categoryHits]) {
    const existing = deduped.get(hit.id);
    if (!existing || hit.score > existing.score) {
      deduped.set(hit.id, hit);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

export function getMenuSearchSuggestions(categories: Category[], limit = 4): string[] {
  return activeMenuSearchCategories(categories)
    .slice(0, limit)
    .map((category) => category.name);
}
