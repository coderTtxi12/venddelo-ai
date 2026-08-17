import { afterEach, describe, expect, it } from 'vitest';

import { publicMenuOrigin, restaurantPublicMenuUrl } from './restaurantSubdomain';

const ORIGINAL_MENU_USE_PATH = process.env.NEXT_PUBLIC_MENU_USE_PATH;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL_MENU_USE_PATH === undefined) {
    delete process.env.NEXT_PUBLIC_MENU_USE_PATH;
  } else {
    process.env.NEXT_PUBLIC_MENU_USE_PATH = ORIGINAL_MENU_USE_PATH;
  }
  if (ORIGINAL_APP_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  }
});

describe('publicMenuOrigin', () => {
  it('never contains /menu/ under path routing', () => {
    process.env.NEXT_PUBLIC_MENU_USE_PATH = 'true';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const origin = publicMenuOrigin('wild-rooster');

    expect(origin).toBe('https://app.example.com');
    expect(origin).not.toContain('/menu/');
    expect(restaurantPublicMenuUrl('wild-rooster')).toBe(
      'https://app.example.com/menu/wild-rooster',
    );
  });

  it('uses the tenant subdomain host when path routing is off', () => {
    delete process.env.NEXT_PUBLIC_MENU_USE_PATH;

    const origin = publicMenuOrigin('wild-rooster');

    expect(origin).toBe('https://wild-rooster.mxy.mx');
    expect(origin).not.toContain('/menu/');
  });
});
