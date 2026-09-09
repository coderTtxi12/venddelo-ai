import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dispatchHistorySearchParams,
  filterEntityOptions,
  historyEmptyHint,
  historyEmptyTitle,
  historyEntityModeLabel,
  historyPageRangeLabel,
  historySearchScopeHint,
  matchesEntityQuery,
  normalizeHistoryQuery,
  selectedEntityOptions,
  toggleEntityId,
} from './historyFilters';

test('autocomplete matches restaurant names ignoring accents and case', () => {
  assert.equal(matchesEntityQuery('Tacos El Güero', 'guero'), true);
  assert.equal(matchesEntityQuery('Pizzería Roma', 'pizzeria'), true);
  assert.equal(matchesEntityQuery('Sushi Nikko', 'taco'), false);
});

test('filterEntityOptions keeps matching restaurants as the user types', () => {
  const options = [
    { id: 'a', label: 'Tacos El Güero' },
    { id: 'b', label: 'Pizzería Roma' },
    { id: 'c', label: 'Taquería Central' },
  ];
  assert.deepEqual(
    filterEntityOptions(options, 'ta').map((row) => row.id),
    ['a', 'c'],
  );
});

test('toggleEntityId adds, removes, and ignores empty ids', () => {
  assert.deepEqual(toggleEntityId([], 'rest-1'), ['rest-1']);
  assert.deepEqual(toggleEntityId(['rest-1'], 'rest-2'), ['rest-1', 'rest-2']);
  assert.deepEqual(toggleEntityId(['rest-1', 'rest-2'], 'rest-1'), ['rest-2']);
  assert.deepEqual(toggleEntityId(['rest-1'], ''), []);
});

test('selectedEntityOptions keeps the chosen order and drops unknown ids', () => {
  const options = [
    { id: 'a', label: 'Tacos' },
    { id: 'b', label: 'Pizza' },
  ];
  assert.deepEqual(selectedEntityOptions(options, ['b', 'missing', 'a']), [
    { id: 'b', label: 'Pizza' },
    { id: 'a', label: 'Tacos' },
  ]);
});

test('mode labels distinguish one vs several selections', () => {
  assert.equal(historyEntityModeLabel('include', 1), 'Solo este');
  assert.equal(historyEntityModeLabel('include', 3), 'Solo estos');
  assert.equal(historyEntityModeLabel('exclude', 1), 'Todos excepto');
  assert.equal(historyEntityModeLabel('exclude', 3), 'Todos excepto');
});

test('normalizeHistoryQuery strips hash, spaces, and lower case from order ids', () => {
  assert.equal(normalizeHistoryQuery('#BDE4E'), 'BDE4E');
  assert.equal(normalizeHistoryQuery('  bde4e  '), 'BDE4E');
  assert.equal(normalizeHistoryQuery('#bd'), 'BD');
  assert.equal(normalizeHistoryQuery(''), '');
});

test('dispatchHistorySearchParams sends the normalized order id query', () => {
  assert.equal(
    dispatchHistorySearchParams({
      start: '2026-09-09',
      end: '2026-09-09',
      q: '#bde4e',
    }).toString(),
    'start=2026-09-09&end=2026-09-09&q=BDE4E&limit=50&offset=0',
  );
});

test('dispatchHistorySearchParams omits empty or hash-only order id query', () => {
  assert.equal(
    dispatchHistorySearchParams({
      start: '2026-09-09',
      end: '2026-09-09',
      q: '#',
    }).toString(),
    'start=2026-09-09&end=2026-09-09&limit=50&offset=0',
  );
});

test('history empty copy explains a missing order id', () => {
  assert.equal(
    historyEmptyTitle('#BDE4E'),
    'No encontramos el pedido #BDE4E en el historial.',
  );
  assert.equal(historyEmptyTitle(''), 'No hay pedidos cerrados en este periodo.');
  assert.equal(
    historyEmptyHint('bde4e'),
    'Revisa el ID o borra la búsqueda para volver al periodo.',
  );
  assert.equal(historyEmptyHint(''), null);
  assert.equal(
    historySearchScopeHint('#bd'),
    'La búsqueda por ID recorre todo el historial, no solo este periodo.',
  );
  assert.equal(historySearchScopeHint(''), null);
});

test('dispatchHistorySearchParams repeats ids for multi include and exclude', () => {
  assert.equal(
    dispatchHistorySearchParams({
      start: '2026-09-09',
      end: '2026-09-09',
      restaurantIds: ['rest-1', 'rest-2'],
      restaurantMode: 'exclude',
      driverIds: ['drv-2', 'drv-3'],
      driverMode: 'include',
      limit: 50,
      offset: 50,
    }).toString(),
    'start=2026-09-09&end=2026-09-09&exclude_restaurant_id=rest-1&exclude_restaurant_id=rest-2&driver_id=drv-2&driver_id=drv-3&limit=50&offset=50',
  );
});

test('historyPageRangeLabel describes the loaded page', () => {
  assert.equal(historyPageRangeLabel(0, 50, 120), '1–50 de 120 pedidos');
  assert.equal(historyPageRangeLabel(50, 20, 70), '51–70 de 70 pedidos');
});
