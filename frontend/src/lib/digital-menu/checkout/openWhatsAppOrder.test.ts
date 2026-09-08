import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLIC_MENU_TABLET_MIN_WIDTH } from '../layout.ts';
import { beginWhatsAppNavigation, type WhatsAppWindow } from './openWhatsAppOrder.ts';

const WA_URL = 'https://wa.me/521555';

function createPopup(): WhatsAppWindow & { closed: boolean; href: string; closeCount: number } {
  const popup = {
    closed: false,
    href: '',
    closeCount: 0,
    location: {
      get href() {
        return popup.href;
      },
      set href(value: string) {
        popup.href = value;
      },
    },
    close() {
      popup.closed = true;
      popup.closeCount += 1;
    },
    focus() {},
  };
  return popup;
}

test('mobile assigns WhatsApp in the same tab and does not open a window', () => {
  const opened: Array<{ url: string; target: string }> = [];
  const host = {
    innerWidth: PUBLIC_MENU_TABLET_MIN_WIDTH - 1,
    location: { href: 'https://menu.example/checkout' },
    open(url: string, target: string) {
      opened.push({ url, target });
      return null;
    },
  };

  const navigation = beginWhatsAppNavigation(host, WA_URL);
  navigation.assign(WA_URL);

  assert.equal(opened.length, 0);
  assert.equal(host.location.href, WA_URL);
});

test('desktop opens WhatsApp on tap, not a blank page', () => {
  const popup = createPopup();
  const opened: Array<{ url: string; target: string }> = [];
  const host = {
    innerWidth: 1280,
    location: { href: 'https://menu.example/checkout' },
    open(url: string, target: string) {
      popup.href = url;
      opened.push({ url, target });
      return popup;
    },
  };

  const navigation = beginWhatsAppNavigation(host, WA_URL);
  assert.deepEqual(opened, [{ url: WA_URL, target: '_blank' }]);
  assert.equal(popup.href, WA_URL);
  assert.equal(host.location.href, 'https://menu.example/checkout');

  navigation.assign(WA_URL);
  assert.equal(popup.href, WA_URL);
  assert.equal(host.location.href, 'https://menu.example/checkout');
});

test('tablet opens WhatsApp in a new tab like desktop', () => {
  const popup = createPopup();
  const host = {
    innerWidth: PUBLIC_MENU_TABLET_MIN_WIDTH,
    location: { href: 'https://menu.example/checkout' },
    open(url: string) {
      popup.href = url;
      return popup;
    },
  };

  beginWhatsAppNavigation(host, WA_URL);
  assert.equal(popup.href, WA_URL);
});

test('desktop cancel closes the WhatsApp window if save fails', () => {
  const popup = createPopup();
  const host = {
    innerWidth: 1280,
    location: { href: 'https://menu.example/checkout' },
    open(url: string) {
      popup.href = url;
      return popup;
    },
  };

  const navigation = beginWhatsAppNavigation(host, WA_URL);
  navigation.cancel();
  assert.equal(popup.closed, true);
  assert.equal(popup.closeCount, 1);
});

test('desktop does not send the menu tab to WhatsApp if the new-tab handle is lost', () => {
  const host = {
    innerWidth: 1280,
    location: { href: 'https://menu.example/checkout' },
    open() {
      return null;
    },
  };

  const navigation = beginWhatsAppNavigation(host, WA_URL);
  navigation.assign(WA_URL);
  assert.equal(host.location.href, 'https://menu.example/checkout');
});

test('desktop does not send the menu tab to WhatsApp if the new tab looks closed', () => {
  const popup = createPopup();
  popup.closed = true;
  const host = {
    innerWidth: 1280,
    location: { href: 'https://menu.example/checkout' },
    open() {
      return popup;
    },
  };

  const navigation = beginWhatsAppNavigation(host, WA_URL);
  navigation.assign(WA_URL);
  assert.equal(host.location.href, 'https://menu.example/checkout');
});
