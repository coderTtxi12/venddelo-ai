import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_KITCHEN_PRINTER,
  defaultPrinterDisplayName,
  hasDefaultKitchenPrinter,
  parseKitchenPrinterPreference,
  printerKindLabel,
} from './kitchenPrinterDevice.ts';

test('parseKitchenPrinterPreference is empty when nothing is stored', () => {
  assert.deepEqual(parseKitchenPrinterPreference(null), EMPTY_KITCHEN_PRINTER);
  assert.equal(hasDefaultKitchenPrinter(parseKitchenPrinterPreference(null)), false);
});

test('parseKitchenPrinterPreference keeps an explicit default printer', () => {
  const usb = parseKitchenPrinterPreference(JSON.stringify({ kind: 'usb', label: 'Epson TM-T20' }));
  assert.equal(usb.kind, 'usb');
  assert.equal(usb.label, 'Epson TM-T20');
  assert.equal(hasDefaultKitchenPrinter(usb), true);

  const bluetooth = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'bluetooth', label: 'MTP-II' }),
  );
  assert.equal(bluetooth.kind, 'bluetooth');
  assert.equal(hasDefaultKitchenPrinter(bluetooth), true);
});

test('defaultPrinterDisplayName uses the stored device name', () => {
  assert.equal(defaultPrinterDisplayName(EMPTY_KITCHEN_PRINTER), 'Sin impresora predeterminada');
  assert.equal(
    defaultPrinterDisplayName({ kind: 'usb', label: 'Epson TM-T20' }),
    'Epson TM-T20',
  );
  assert.equal(
    defaultPrinterDisplayName({ kind: 'bluetooth', label: '  MTP-II  ' }),
    'MTP-II',
  );
});

test('printerKindLabel names bluetooth printers', () => {
  assert.equal(printerKindLabel('bluetooth'), 'Bluetooth');
  assert.equal(printerKindLabel('none'), 'Sin impresora');
});
