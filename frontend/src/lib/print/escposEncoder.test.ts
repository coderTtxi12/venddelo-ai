import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeKitchenTicketEscPos } from './escposEncoder.ts';
import type { KitchenTicketDocument } from './ticketDocument.ts';

const ESC = 0x1b;

const INIT = [ESC, 0x40, 0x1c, 0x2e, ESC, 0x74, 2, 0x1d, 0x4c, 0, 0];

function ticket(lines: KitchenTicketDocument['lines']): KitchenTicketDocument {
  return {
    paperWidthMm: 80,
    copies: 1,
    logoUrl: null,
    brandName: 'Prueba',
    lines,
  };
}

function payloadText(bytes: Uint8Array): Uint8Array {
  assert.deepEqual([...bytes.slice(0, INIT.length)], INIT);
  return bytes;
}

test('encodeKitchenTicketEscPos cancels Chinese mode then selects PC850', () => {
  const bytes = encodeKitchenTicketEscPos(ticket([{ kind: 'center', text: 'México' }]));
  assert.deepEqual([...bytes.slice(0, INIT.length)], INIT);
});

test('encodeKitchenTicketEscPos encodes Spanish accents as PC850 single bytes', () => {
  const bytes = payloadText(
    encodeKitchenTicketEscPos(
      ticket([
        { kind: 'center', text: 'México' },
        { kind: 'kv', label: 'Cliente', value: 'María López' },
        { kind: 'title', text: 'Artículos' },
        { kind: 'item', qty: 2, name: 'Tacos', price: '$13.00' },
      ]),
    ),
  );
  const asArray = [...bytes];
  assert.equal(asArray.includes(0xe9), false, 'é must not be sent as CP1252 0xE9');
  assert.ok(asArray.includes(0x82), 'é in México should be CP850 0x82');
  assert.ok(asArray.includes(0xa1), 'í in María should be CP850 0xA1');
  assert.ok(asArray.includes(0xa2), 'ó in López should be CP850 0xA2');
  assert.ok(asArray.includes(0xd6), 'Í in ARTÍCULOS should be CP850 0xD6');
});

test('encodeKitchenTicketEscPos writes quantity with ASCII x, not ×', () => {
  const bytes = encodeKitchenTicketEscPos(
    ticket([{ kind: 'item', qty: 2, name: 'Tacos al Pastor', price: '$13.00' }]),
  );
  const ascii = String.fromCharCode(...bytes.filter((b) => b >= 32 && b < 127));
  assert.match(ascii, /2x Tacos al Pastor/);
  assert.doesNotMatch(ascii, /2\? Tacos/);
});

test('encodeKitchenTicketEscPos maps middle dots to ASCII hyphen', () => {
  const bytes = encodeKitchenTicketEscPos(
    ticket([{ kind: 'kv', label: 'Pago', value: 'Efectivo · con $200.00' }]),
  );
  const ascii = String.fromCharCode(...bytes.filter((b) => b >= 32 && b < 127));
  assert.match(ascii, /Efectivo - con \$200\.00/);
  assert.doesNotMatch(ascii, /Efectivo \? con/);
});

test('encodeKitchenTicketEscPos sets 80mm print area and right-aligns prices', () => {
  const bytes = encodeKitchenTicketEscPos(
    ticket([{ kind: 'item', qty: 1, name: 'Vaso Gomitas', price: '$40.00' }]),
  );
  const gsW = [...bytes].slice(7, 13);
  assert.deepEqual(gsW, [0x1d, 0x4c, 0, 0, 0x1d, 0x57]);
  assert.equal(bytes[13], 576 & 0xff);
  assert.equal(bytes[14], 576 >> 8);
  const ascii = String.fromCharCode(...bytes.filter((b) => b >= 32 && b < 127));
  assert.match(ascii, /1x Vaso Gomitas {2,}\$40\.00/);
});

test('encodeKitchenTicketEscPos indents complements on their own lines', () => {
  const bytes = encodeKitchenTicketEscPos(
    ticket([
      { kind: 'item', qty: 1, name: 'Frappe moca', price: '$85.00' },
      { kind: 'option', text: 'Personaliza tu bebida: Deslactosada, Sin azucar' },
    ]),
  );
  const ascii = String.fromCharCode(...bytes.filter((b) => b >= 32 && b < 127));
  assert.match(ascii, /  Personaliza tu bebida:/);
});
