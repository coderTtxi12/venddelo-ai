import { cache } from 'react';

import {
  getPublicMenu,
  getPublicRestaurant,
  type PublicMenu,
  type PublicRestaurant,
} from './public';

const SERVER_PREFETCH_OPTIONS = { cache: 'no-store' as const };

export type PublicMenuCriticalData = {
  restaurant: PublicRestaurant;
  menu: PublicMenu;
};

/** Server-only: restaurant + menu for live menu first paint (deduped per request via React cache). */
export const fetchPublicMenuCriticalData = cache(
  async (subdomain: string): Promise<PublicMenuCriticalData> => {
    const [restaurant, menu] = await Promise.all([
      getPublicRestaurant(subdomain, SERVER_PREFETCH_OPTIONS),
      getPublicMenu(subdomain, 'default', SERVER_PREFETCH_OPTIONS),
    ]);
    return { restaurant, menu };
  },
);
