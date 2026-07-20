'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getProduct } from '@/lib/api/menu';
import type { Order, Product } from '@/lib/api/types';

export type KitchenOrderProductsState = {
  productsById: ReadonlyMap<string, Product>;
  isLoading: boolean;
};

export function useKitchenOrderProducts(
  accessToken: string | null,
  restaurantId: string | null,
  selectedOrder: Order | null,
): KitchenOrderProductsState {
  const [productsById, setProductsById] = useState<Map<string, Product>>(() => new Map());
  const [cacheRestaurantId, setCacheRestaurantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Map<string, Product>>(new Map());
  const cacheRestaurantRef = useRef<string | null>(null);

  const selectedProductIds = useMemo(() => {
    if (!selectedOrder) return [];
    return [
      ...new Set(
        selectedOrder.items
          .map((item) => item.product_id)
          .filter((productId): productId is string => Boolean(productId)),
      ),
    ];
  }, [selectedOrder]);

  useEffect(() => {
    if (!accessToken || !restaurantId || selectedProductIds.length === 0) {
      setIsLoading(false);
      return;
    }

    if (cacheRestaurantRef.current !== restaurantId) {
      cacheRef.current = new Map();
      cacheRestaurantRef.current = restaurantId;
      setCacheRestaurantId(restaurantId);
      setProductsById(new Map());
    }

    const idsToLoad = selectedProductIds.filter((productId) => !cacheRef.current.has(productId));
    if (idsToLoad.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.all(
      idsToLoad.map((productId) => getProduct(accessToken, restaurantId, productId)),
    )
      .then((products) => {
        if (cancelled) return;
        for (const product of products) {
          cacheRef.current.set(product.id, product);
        }
        setProductsById(new Map(cacheRef.current));
        setCacheRestaurantId(restaurantId);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, restaurantId, selectedProductIds]);

  return {
    productsById: cacheRestaurantId === restaurantId ? productsById : new Map(),
    isLoading,
  };
}
