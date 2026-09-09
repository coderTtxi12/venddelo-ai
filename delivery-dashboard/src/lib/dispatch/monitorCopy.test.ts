import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockerLabel,
  blockersSummary,
  creditHoldKindLabel,
  dispatchSourceLabel,
  requestMoneyLine,
  requestStatusLabel,
  splitDropoffAddress,
  timelineEventTitle,
} from './monitorCopy';
import type { DispatchMonitorRequest } from '../api/types';
import { formatMoney } from '../pricing/tariffUtils';

test('blockerLabel names outdated_app in Spanish', () => {
  assert.equal(blockerLabel('outdated_app'), 'App vieja');
});

test('blockersSummary keeps the text label so color is not the only signal', () => {
  const summary = blockersSummary([
    { code: 'outdated_app', count: 3 },
    { code: 'offline', count: 1 },
  ]);
  assert.equal(summary, 'App vieja (3) · Offline (1)');
});

test('picked_up means the rider arrived at the restaurant', () => {
  assert.equal(requestStatusLabel('picked_up'), 'En el restaurante');
  assert.equal(
    timelineEventTitle({ at: null, kind: 'picked_up' }),
    'En el restaurante',
  );
});

test('splitDropoffAddress separates dispatch references after the last separator', () => {
  assert.deepEqual(
    splitDropoffAddress(
      'Kiosko Rinconada San Felipe, Méx., Mexico · puerta color blanca',
    ),
    {
      address: 'Kiosko Rinconada San Felipe, Méx., Mexico',
      references: 'puerta color blanca',
    },
  );
});

test('splitDropoffAddress separates checkout Referencias marker', () => {
  assert.deepEqual(splitDropoffAddress('Calle Reforma 100\nReferencias: puerta azul'), {
    address: 'Calle Reforma 100',
    references: 'puerta azul',
  });
});

test('splitDropoffAddress keeps a plain address', () => {
  assert.deepEqual(splitDropoffAddress('Calle Reforma 100'), {
    address: 'Calle Reforma 100',
    references: '',
  });
});

test('creditHoldKindLabel distinguishes Mexy commission from restaurant cash', () => {
  assert.equal(creditHoldKindLabel('mexy_fee'), 'Comisión Mexy');
  assert.equal(creditHoldKindLabel('restaurant_cash'), 'Efectivo');
  assert.equal(creditHoldKindLabel(undefined), 'Efectivo');
});

test('dispatchSourceLabel distinguishes digital menu from manual delivery', () => {
  assert.equal(dispatchSourceLabel('web_app'), 'App web');
  assert.equal(dispatchSourceLabel('manual'), 'Pedido manual');
});

test('requestMoneyLine shows Mexy commission when present', () => {
  const line = requestMoneyLine({
    payment_method: 'transfer',
    collect_cents: 0,
    quoted_fee_cents: 16000,
    mexy_fee_cents: 3500,
  } as DispatchMonitorRequest);
  assert.equal(
    line,
    `Transferencia · envío ${formatMoney(16000)} · Mexy ${formatMoney(3500)}`,
  );
});
