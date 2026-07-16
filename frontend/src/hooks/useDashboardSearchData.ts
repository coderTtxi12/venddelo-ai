'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { listCategories, listProducts } from '@/lib/api/menu';
import { fetchAllPages } from '@/lib/api/pagination';
import type { Category, Product } from '@/lib/api/types';

type DashboardSearchData = {
  products: Product[];
  categories: Category[];
  loading: boolean;
  error: string | null;
};

export function useDashboardSearchData(enabled: boolean): DashboardSearchData {
  const { accessToken } = useAuth();
  const { selectedRestaurantId } = useRestaurantAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedRestaurantId, setLoadedRestaurantId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!enabled || !accessToken || !selectedRestaurantId) return;
    if (loadedRestaurantId === selectedRestaurantId && products.length > 0) return;

    setLoading(true);
    setError(null);

    try {
      const [productRows, categoryRows] = await Promise.all([
        fetchAllPages((cursor) => listProducts(accessToken, selectedRestaurantId, 100, cursor), 100),
        fetchAllPages(
          (cursor) =>
            listCategories(accessToken, selectedRestaurantId, 100, cursor, { includeInactive: true }),
          100,
        ),
      ]);

      setProducts(productRows);
      setCategories(categoryRows);
      setLoadedRestaurantId(selectedRestaurantId);
    } catch (loadError) {
      console.error(loadError);
      setError('No se pudieron cargar productos para la búsqueda.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, enabled, loadedRestaurantId, products.length, selectedRestaurantId]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setProducts([]);
      setCategories([]);
      setLoadedRestaurantId(null);
      return;
    }

    if (loadedRestaurantId !== selectedRestaurantId) {
      setProducts([]);
      setCategories([]);
      setLoadedRestaurantId(null);
    }
  }, [loadedRestaurantId, selectedRestaurantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return { products, categories, loading, error };
}
