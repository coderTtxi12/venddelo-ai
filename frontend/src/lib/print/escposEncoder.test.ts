import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeKitchenTicketEscPos } from './escposEncoder.ts';
import type { KitchenTicketDocument } from './ticketDocument.ts';

const ESC = 0x1b;

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
  const init = [ESC, 0x40, ESC, 0x74, 2];
  assert.deepEqual([...bytes.slice(0, 5)], init);
  return bytes;
}

test('encodeKitchenTicketEscPos selects PC850, not Windows-1252', () => {
  const bytes = encodeKitchenTicketEscPos(ticket([{ kind: 'center', text: 'México' }]));
  assert.equal(bytes[0], ESC);
  assert.equal(bytes[1], 0x40);
  assert.equal(bytes[2], ESC);
  assert.equal(bytes[3], 0x74);
  assert.equal(bytes[4], 2);
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
