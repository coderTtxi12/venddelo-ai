import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockerLabel,
  blockersSummary,
  creditHoldKindLabel,
  dispatchSourceLabel,
  formatCoords,
  mexyReleaseConfirmCopy,
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

test('formatCoords keeps full precision so pasted pins match the original point', () => {
  const formatted = formatCoords(19.62450131234567, -99.10079971234567);
  assert.ok(formatted);
  assert.match(formatted, /19\.62450131234567/);
  assert.match(formatted, /-99\.10079971234567/);
  assert.notEqual(formatted, '19.624501, -99.100800');
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

test('mexyReleaseConfirmCopy asks twice before releasing commission', () => {
  const hold = {
    short_id: 'AB12',
    amount_cents: 3500,
    driver_name: 'Carlos',
    restaurant_name: 'Wild Rooster',
  };
  const first = mexyReleaseConfirmCopy(hold, 1);
  assert.equal(first.title, '¿Liberar la comisión Mexy?');
  assert.match(first.body, /crédito retenido/);
  assert.equal(first.confirmLabel, 'Continuar');
  assert.equal(first.cancelLabel, 'Todavía no');

  const second = mexyReleaseConfirmCopy(hold, 2);
  assert.equal(second.title, 'Confirma la liberación');
  assert.match(second.body, /#AB12/);
  assert.match(second.body, new RegExp(formatMoney(3500).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(second.body, /Carlos/);
  assert.equal(second.confirmLabel, 'Sí, liberar comisión');
  assert.equal(second.cancelLabel, 'Volver');
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
