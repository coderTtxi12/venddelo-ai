'use client';

import { useEffect, useState } from 'react';
import {
  listRestaurantCustomers,
  type RestaurantCustomer,
} from '@/lib/api/customers';

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 280;

export function useCustomerSuggestions({
  accessToken,
  restaurantId,
  query,
  enabled,
}: {
  accessToken: string;
  restaurantId: string;
  query: string;
  enabled: boolean;
}): {
  items: RestaurantCustomer[];
  loading: boolean;
} {
  const [items, setItems] = useState<RestaurantCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < MIN_QUERY_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void listRestaurantCustomers(accessToken, restaurantId, 8, { q: trimmed })
        .then((page) => {
          if (!cancelled) setItems(page.items);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, enabled, query, restaurantId]);

  return { items, loading };
}

export { MIN_QUERY_CHARS };
