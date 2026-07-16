import {
  buildProductsPageHref,
  parseProductsPageFilter,
  type ProductsPageFilter,
} from '@/lib/search/productsPageFilter';

describe('productsPageFilter', () => {
  it('builds a products page href with tab and query', () => {
    expect(
      buildProductsPageHref({ tab: 'products', query: 'Tacos al Pastor' }),
    ).toBe('/products?tab=products&q=Tacos+al+Pastor');
  });

  it('parses filter params from the url', () => {
    const params = new URLSearchParams('tab=categories&q=Bebidas');
    expect(parseProductsPageFilter(params)).toEqual({
      tab: 'categories',
      query: 'Bebidas',
    } satisfies ProductsPageFilter);
  });

  it('defaults to products tab when tab is missing', () => {
    const params = new URLSearchParams('q=Hamburguesa');
    expect(parseProductsPageFilter(params)).toEqual({
      tab: 'products',
      query: 'Hamburguesa',
    });
  });
});
