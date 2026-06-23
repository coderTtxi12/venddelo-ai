import type { Category, Product, Promotion } from '@/lib/api/types';

export type MenuSearchHitKind = 'product' | 'promotion' | 'category';

export type MenuSearchHit = {
  id: string;
  kind: MenuSearchHitKind;
  title: string;
  subtitle?: string;
  matchLabels: string[];
  score: number;
  product?: Product;
  promotion?: Promotion;
  category?: Category;
};

export type MenuSearchInput = {
  query: string;
  products: Product[];
  categories: Category[];
  promotions: Promotion[];
  productDiscounts?: Map<string, unknown>;
};

const MATCH_LABELS = {
  name: 'Nombre',
  description: 'Descripción',
  complement: 'Complemento',
  category: 'Categoría',
  promotion: 'Promoción',
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

function buildCategoryNameMap(categories: Category[]): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

function promotionsForProduct(product: Product, promotions: Promotion[]): Promotion[] {
  return promotions.filter((promotion) => {
    if (promotion.scope === 'product') {
      return promotion.product_ids?.includes(product.id) ?? false;
    }
    if (promotion.scope === 'category') {
      const promoCategoryIds = promotion.category_ids ?? [];
      return product.category_ids.some((categoryId) => promoCategoryIds.includes(categoryId));
    }
    return false;
  });
}

function searchProducts(
  products: Product[],
  categories: Category[],
  promotions: Promotion[],
  tokens: string[],
): MenuSearchHit[] {
  const categoryNames = buildCategoryNameMap(categories);
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

    const productCategoryNames = product.category_ids
      .map((categoryId) => categoryNames.get(categoryId))
      .filter((name): name is string => Boolean(name));

    for (const categoryName of productCategoryNames) {
      if (textMatchesTokens(categoryName, tokens)) {
        matchLabels.add(MATCH_LABELS.category);
        score += scoreTextMatch(categoryName, tokens);
      }
    }

    for (const promotion of promotionsForProduct(product, promotions)) {
      if (textMatchesTokens(promotion.name, tokens)) {
        matchLabels.add(MATCH_LABELS.promotion);
        score += scoreTextMatch(promotion.name, tokens);
      }
    }

    if (matchLabels.size === 0) continue;

    const categorySubtitle =
      productCategoryNames.length > 0 ? productCategoryNames.join(' · ') : undefined;

    hits.push({
      id: `product:${product.id}`,
      kind: 'product',
      title: product.name,
      subtitle: product.description?.trim() || categorySubtitle,
      matchLabels: Array.from(matchLabels),
      score,
      product,
    });
  }

  return hits;
}

function searchPromotions(promotions: Promotion[], tokens: string[]): MenuSearchHit[] {
  const hits: MenuSearchHit[] = [];

  for (const promotion of promotions) {
    if (!textMatchesTokens(promotion.name, tokens)) continue;

    hits.push({
      id: `promotion:${promotion.id}`,
      kind: 'promotion',
      title: promotion.name,
      subtitle: 'Promoción',
      matchLabels: [MATCH_LABELS.promotion],
      score: scoreTextMatch(promotion.name, tokens) * 1.5,
      promotion,
    });
  }

  return hits;
}

function searchCategories(categories: Category[], tokens: string[]): MenuSearchHit[] {
  const hits: MenuSearchHit[] = [];

  for (const category of categories) {
    const nameMatches = textMatchesTokens(category.name, tokens);
    const descriptionMatches =
      category.description != null && textMatchesTokens(category.description, tokens);

    if (!nameMatches && !descriptionMatches) continue;

    const matchLabels: string[] = [];
    let score = 0;

    if (nameMatches) {
      matchLabels.push(MATCH_LABELS.category);
      score += scoreTextMatch(category.name, tokens) * 1.2;
    }
    if (descriptionMatches && category.description) {
      matchLabels.push(MATCH_LABELS.description);
      score += scoreTextMatch(category.description, tokens);
    }

    hits.push({
      id: `category:${category.id}`,
      kind: 'category',
      title: category.name,
      subtitle: category.description?.trim() || 'Categoría',
      matchLabels,
      score,
      category,
    });
  }

  return hits;
}

export function searchMenu(input: MenuSearchInput): MenuSearchHit[] {
  const tokens = tokenizeQuery(input.query);
  if (tokens.length === 0) return [];

  const productHits = searchProducts(input.products, input.categories, input.promotions, tokens);
  const promotionHits = searchPromotions(input.promotions, tokens);
  const categoryHits = searchCategories(input.categories, tokens);

  const deduped = new Map<string, MenuSearchHit>();

  for (const hit of [...productHits, ...promotionHits, ...categoryHits]) {
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
  return categories
    .filter((category) => category.is_active)
    .slice(0, limit)
    .map((category) => category.name);
}
