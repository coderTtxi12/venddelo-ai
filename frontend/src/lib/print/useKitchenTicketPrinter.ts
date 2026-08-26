'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRestaurant } from '@/lib/api/restaurants';
import { getProduct } from '@/lib/api/menu';
import type { Order, Product, Restaurant } from '@/lib/api/types';
import { printKitchenOrderTicket, type PrintKitchenTicketResult } from '@/lib/print/printKitchenTicket';
import { primeKitchenPrinterConnections } from '@/lib/print/kitchenPrinterDevice';
import { productIdsNeededForTicketOptions } from '@/lib/print/ticketDocument';
import { normalizeTicketPrintSettings, type KitchenTicketPrintTrigger } from '@/lib/print/ticketSettings';
import { storagePublicUrl } from '@/lib/storage/publicUrl';

export function useKitchenTicketPrinter(
  accessToken: string | null | undefined,
  restaurantId: string | null | undefined,
) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !restaurantId) {
        setRestaurant(null);
        return;
      }
      try {
        const data = await getRestaurant(accessToken, restaurantId);
        if (!cancelled) setRestaurant(data);
      } catch (error) {
        console.warn('No se pudo cargar la configuración de tickets', error);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    void primeKitchenPrinterConnections(restaurantId);
  }, [restaurantId]);

  const printOrder = useCallback(
    async (
      order: Order,
      trigger: KitchenTicketPrintTrigger | 'manual',
      productsById?: ReadonlyMap<string, Product>,
    ): Promise<PrintKitchenTicketResult> => {
      if (!restaurantId || !restaurant || !accessToken) return { status: 'skipped' };
      let catalog = new Map(productsById ?? []);
      const missing = productIdsNeededForTicketOptions(order, catalog);
      if (missing.length > 0) {
        try {
          const loaded = await Promise.all(
            missing.map((productId) => getProduct(accessToken, restaurantId, productId)),
          );
          for (const product of loaded) catalog.set(product.id, product);
        } catch {
          // Print the ticket even if option labels cannot be resolved.
        }
      }
      return printKitchenOrderTicket({
        restaurantId,
        order,
        settings: normalizeTicketPrintSettings(restaurant.ticket_print_settings),
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address,
        logoUrl: storagePublicUrl(restaurant.logo_path),
        productsById: catalog,
        trigger,
        accessToken,
      });
    },
    [accessToken, restaurant, restaurantId],
  );

  return { restaurant, printOrder };
}
