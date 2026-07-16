export type ProductsPageFilter = {
  tab: 'products' | 'categories';
  query: string;
};

export const PRODUCTS_PAGE_FILTER_QUERY_PARAM = 'q';
export const PRODUCTS_PAGE_FILTER_TAB_PARAM = 'tab';

export function buildProductsPageHref(filter: ProductsPageFilter): string {
  const params = new URLSearchParams();
  params.set(PRODUCTS_PAGE_FILTER_TAB_PARAM, filter.tab);
  params.set(PRODUCTS_PAGE_FILTER_QUERY_PARAM, filter.query);
  return `/products?${params.toString()}`;
}

export function parseProductsPageFilter(searchParams: Pick<URLSearchParams, 'get'>): ProductsPageFilter | null {
  const query = searchParams.get(PRODUCTS_PAGE_FILTER_QUERY_PARAM)?.trim();
  if (!query) return null;

  const tab = searchParams.get(PRODUCTS_PAGE_FILTER_TAB_PARAM);
  if (tab === 'categories') {
    return { tab: 'categories', query };
  }

  return { tab: 'products', query };
}
