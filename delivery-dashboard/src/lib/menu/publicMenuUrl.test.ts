import assert from 'node:assert/strict';
import test from 'node:test';

import { restaurantPublicMenuLabel, restaurantPublicMenuUrl } from './publicMenuUrl';

test('restaurantPublicMenuUrl builds the public subdomain host', () => {
  assert.equal(restaurantPublicMenuUrl('tacos-el-guero'), 'https://tacos-el-guero.mxy.mx');
});

test('restaurantPublicMenuUrl ignores blank subdomain', () => {
  assert.equal(restaurantPublicMenuUrl('  '), null);
});

test('restaurantPublicMenuLabel shows host without protocol', () => {
  assert.equal(restaurantPublicMenuLabel('https://tacos-el-guero.mxy.mx'), 'tacos-el-guero.mxy.mx');
});
