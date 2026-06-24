'use client';

import { useCallback, useEffect } from 'react';
import type { Order } from '@/lib/api/types';
import { attachNewOrderAudioUnlock, playNewOrderSound } from '@/lib/orders/newOrderSound';
import type { KitchenOrderSocketEvent } from '@/lib/orders/useKitchenOrdersSocket';

export function useNewOrderSoundAlert(): (event: KitchenOrderSocketEvent, current: Order[]) => void {
  useEffect(() => attachNewOrderAudioUnlock(), []);

  return useCallback((event: KitchenOrderSocketEvent, current: Order[]) => {
    if (event.type !== 'order.created') return;
    if (current.some((order) => order.id === event.order.id)) return;
    playNewOrderSound();
  }, []);
}
