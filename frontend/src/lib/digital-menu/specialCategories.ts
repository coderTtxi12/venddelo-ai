import type { Category, Product } from '@/lib/api/types';
import type { MenuProductDiscountInfo } from '@/lib/promotions/menuProductDiscount';

export const DIGITAL_MENU_PROMOTIONS_CATEGORY_ID = '__dm_promotions__';
export const DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID = '__dm_limited_time__';

export const DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME = 'Promociones';
export const DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME = 'Por tiempo limitado';

export type DigitalMenuSpecialCategoryKind = 'promotions' | 'limited_time';

export type DigitalMenuSpecialCategoryConfig = {
  promotionsCategoryEnabled: boolean;
  promotionsCategoryName: string;
  limitedTimeCategoryEnabled: boolean;
  limitedTimeCategoryName: string;
};

type SpecialCategoryRestaurantFields = {
  digital_menu_promotions_category_enabled?: boolean;
  digital_menu_promotions_category_name?: string;
  digital_menu_limited_time_category_enabled?: boolean;
  digital_menu_limited_time_category_name?: string;
};

export function digitalMenuSpecialCategoryConfigFromRestaurant(
  restaurant: SpecialCategoryRestaurantFields | null | undefined,
): DigitalMenuSpecialCategoryConfig {
  return {
    promotionsCategoryEnabled: restaurant?.digital_menu_promotions_category_enabled ?? true,
    promotionsCategoryName:
      restaurant?.digital_menu_promotions_category_name?.trim() ||
      DEFAULT_DIGITAL_MENU_PROMOTIONS_CATEGORY_NAME,
    limitedTimeCategoryEnabled: restaurant?.digital_menu_limited_time_category_enabled ?? true,
    limitedTimeCategoryName:
      restaurant?.digital_menu_limited_time_category_name?.trim() ||
      DEFAULT_DIGITAL_MENU_LIMITED_TIME_CATEGORY_NAME,
  };
}

export function isDigitalMenuSpecialCategoryId(categoryId: string): boolean {
  return (
    categoryId === DIGITAL_MENU_PROMOTIONS_CATEGORY_ID ||
    categoryId === DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID
  );
}

export function getDigitalMenuSpecialCategoryKind(
  categoryId: string,
): DigitalMenuSpecialCategoryKind | null {
  if (categoryId === DIGITAL_MENU_PROMOTIONS_CATEGORY_ID) return 'promotions';
  if (categoryId === DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID) return 'limited_time';
  return null;
}

function buildVirtualCategory(
  id: string,
  restaurantId: string,
  name: string,
  displayLayout: Category['display_layout'],
  sortIndex: number,
): Category {
  const now = new Date(0).toISOString();
  return {
    id,
    restaurant_id: restaurantId,
    name,
    description: null,
    image_path: null,
    sort_index: sortIndex,
    display_layout: displayLayout,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

export function buildDigitalMenuDisplayCategories(
  baseCategories: Category[],
  options: {
    config: DigitalMenuSpecialCategoryConfig;
    restaurantId: string;
    hasPromotionShortcuts: boolean;
    hasLimitedTimeProducts: boolean;
  },
): Category[] {
  const { config, restaurantId, hasPromotionShortcuts, hasLimitedTimeProducts } = options;
  const specials: Category[] = [];
  let sortIndex = -1000;

  if (config.promotionsCategoryEnabled && hasPromotionShortcuts) {
    specials.push(
      buildVirtualCategory(
        DIGITAL_MENU_PROMOTIONS_CATEGORY_ID,
        restaurantId,
        config.promotionsCategoryName,
        'horizontal',
        sortIndex,
      ),
    );
    sortIndex += 1;
  }

  if (config.limitedTimeCategoryEnabled && hasLimitedTimeProducts) {
    specials.push(
      buildVirtualCategory(
        DIGITAL_MENU_LIMITED_TIME_CATEGORY_ID,
        restaurantId,
        config.limitedTimeCategoryName,
        'horizontal',
        sortIndex,
      ),
    );
  }

  return [...specials, ...baseCategories];
}

export function productsForLimitedTimeCategory(
  products: Product[],
  productDiscounts: Map<string, MenuProductDiscountInfo>,
): Product[] {
  const discounted = products.filter((product) => productDiscounts.has(product.id));
  return [...discounted].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export function digitalMenuSpecialCategoryNames(
  displayCategories: Category[],
): string[] {
  return displayCategories.map((category) => category.name);
}
