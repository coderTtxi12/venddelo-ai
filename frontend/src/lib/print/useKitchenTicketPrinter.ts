'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRestaurant } from '@/lib/api/restaurants';
import type { Order, Product, Restaurant } from '@/lib/api/types';
import { printKitchenOrderTicket, type PrintKitchenTicketResult } from '@/lib/print/printKitchenTicket';
import { primeKitchenPrinterConnections } from '@/lib/print/kitchenPrinterDevice';
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

  const printOrder = useCallback(
    async (
      order: Order,
      trigger: KitchenTicketPrintTrigger | 'manual',
      productsById?: ReadonlyMap<string, Product>,
    ): Promise<PrintKitchenTicketResult> => {
      if (!restaurantId || !restaurant) return { status: 'skipped' };
      return printKitchenOrderTicket({
        restaurantId,
        order,
        settings: normalizeTicketPrintSettings(restaurant.ticket_print_settings),
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address,
        logoUrl: storagePublicUrl(restaurant.logo_path),
        productsById,
        trigger,
      });
    },
    [restaurant, restaurantId],
  );

  return { restaurant, printOrder };
}
