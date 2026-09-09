import assert from 'node:assert/strict';
import test from 'node:test';

import { SIDEBAR_NAV_SECTIONS, sidebarNavPaths, showsAllZonesOption } from './sidebarNav';

test('sidebar groups courier tools into operation, network, service, and account', () => {
  assert.deepEqual(
    SIDEBAR_NAV_SECTIONS.map((section) => section.id),
    ['operacion', 'red', 'servicio', 'cuenta'],
  );
  assert.deepEqual(sidebarNavPaths(), [
    '/monitor',
    '/historial',
    '/estadisticas',
    '/partnerships',
    '/repartidores',
    '/asignacion',
    '/tariffs',
    '/horarios',
    '/cerco-geografico',
    '/settings',
  ]);
  assert.equal(
    SIDEBAR_NAV_SECTIONS.find((section) => section.id === 'red')?.label,
    'Red',
  );
});

test('monitor, history, and stats can filter all zones', () => {
  assert.equal(showsAllZonesOption('/estadisticas'), true);
  assert.equal(showsAllZonesOption('/repartidores'), false);
});
