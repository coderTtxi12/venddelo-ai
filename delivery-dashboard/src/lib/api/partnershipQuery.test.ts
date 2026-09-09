import assert from 'node:assert/strict';
import test from 'node:test';

import { partnershipListPath } from './partnershipQuery';

test('partnershipListPath sends search, sort, web-app filter, and pagination', () => {
  assert.equal(
    partnershipListPath('active', {
      q: 'tacos',
      sort: 'name',
      hasWebApp: true,
      zoneId: 'zone-1',
      limit: 20,
      offset: 40,
    }),
    '/delivery-providers/me/partnerships?zone_id=zone-1&q=tacos&has_web_app=true&sort=name&limit=20&offset=40',
  );
});

test('partnershipListPath omits empty search and all web-app filter', () => {
  assert.equal(
    partnershipListPath('pending', { q: '  ', hasWebApp: null, limit: 10, offset: 0 }),
    '/delivery-providers/me/partnership-requests?limit=10&offset=0',
  );
});

test('partnershipListPath sends on_hold filter', () => {
  assert.equal(
    partnershipListPath('active', { onHold: true, limit: 20, offset: 0 }),
    '/delivery-providers/me/partnerships?on_hold=true&limit=20&offset=0',
  );
});
