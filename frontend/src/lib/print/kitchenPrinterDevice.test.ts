import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_KITCHEN_PRINTER,
  defaultPrinterDisplayName,
  hasDefaultKitchenPrinter,
  isLanPrinterIpv4,
  parseKitchenPrinterPreference,
  printerKindLabel,
  shouldApplyTypedNetworkHost,
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

test('parseKitchenPrinterPreference keeps bluetooth device id', () => {
  const bluetooth = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'bluetooth', label: 'MTP-II', bluetoothDeviceId: 'id-123' }),
  );
  assert.equal(bluetooth.kind, 'bluetooth');
  assert.equal(bluetooth.bluetoothDeviceId, 'id-123');
});

test('parseKitchenPrinterPreference keeps a network printer', () => {
  const network = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'network', label: 'Cocina', host: '192.168.1.50', port: 9100 }),
  );
  assert.equal(network.kind, 'network');
  assert.equal(network.host, '192.168.1.50');
  assert.equal(defaultPrinterDisplayName(network), 'Cocina (192.168.1.50)');
});

test('isLanPrinterIpv4 accepts private addresses', () => {
  assert.equal(isLanPrinterIpv4('192.168.1.50'), true);
  assert.equal(isLanPrinterIpv4('10.0.0.8'), true);
  assert.equal(isLanPrinterIpv4('8.8.8.8'), false);
  assert.equal(isLanPrinterIpv4('printer.local'), false);
});

test('printerKindLabel names bluetooth printers', () => {
  assert.equal(printerKindLabel('bluetooth'), 'Bluetooth');
  assert.equal(printerKindLabel('network'), 'Wi‑Fi / Ethernet');
  assert.equal(printerKindLabel('none'), 'Sin impresora');
});

test('parseKitchenPrinterPreference keeps a named system printer', () => {
  const system = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'system', label: 'EPSON_TM', systemPrinterName: 'EPSON_TM' }),
  );
  assert.equal(system.kind, 'system');
  assert.equal(system.systemPrinterName, 'EPSON_TM');
  assert.equal(defaultPrinterDisplayName(system), 'EPSON_TM');
});

test('parseKitchenPrinterPreference system without a queue uses the generic label', () => {
  const system = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'system', label: 'Impresora del sistema' }),
  );
  assert.equal(system.kind, 'system');
  assert.equal(system.systemPrinterName, undefined);
  assert.equal(defaultPrinterDisplayName(system), 'Impresora del sistema');
});

test('shouldApplyTypedNetworkHost uses a typed LAN IP instead of the system dialog', () => {
  const systemDialog = parseKitchenPrinterPreference(
    JSON.stringify({ kind: 'system', label: 'Impresora del sistema' }),
  );
  assert.equal(shouldApplyTypedNetworkHost(systemDialog, '192.168.100.50'), true);
  assert.equal(shouldApplyTypedNetworkHost(EMPTY_KITCHEN_PRINTER, '192.168.100.50'), true);
  assert.equal(
    shouldApplyTypedNetworkHost(
      { kind: 'network', label: 'Cocina', host: '192.168.1.10', port: 9100 },
      '192.168.100.50',
    ),
    true,
  );
});

test('shouldApplyTypedNetworkHost does not override USB or an already selected host', () => {
  assert.equal(
    shouldApplyTypedNetworkHost({ kind: 'usb', label: 'Epson TM-T20' }, '192.168.100.50'),
    false,
  );
  assert.equal(
    shouldApplyTypedNetworkHost(
      { kind: 'network', label: 'Cocina', host: '192.168.100.50', port: 9100 },
      '192.168.100.50',
    ),
    false,
  );
  assert.equal(shouldApplyTypedNetworkHost(EMPTY_KITCHEN_PRINTER, 'not-an-ip'), false);
});
