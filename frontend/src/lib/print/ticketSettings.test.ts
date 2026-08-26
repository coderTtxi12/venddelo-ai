import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TICKET_PRINT_SETTINGS,
  normalizeTicketPrintSettings,
  shouldPrintKitchenTicket,
} from './ticketSettings.ts';

test('normalizeTicketPrintSettings fills defaults for empty input', () => {
  const settings = normalizeTicketPrintSettings(null);
  assert.equal(settings.enabled, false);
  assert.equal(settings.paper_width_mm, 80);
  assert.equal(settings.copies, 1);
  assert.equal(settings.show_logo, true);
  assert.equal(settings.brand_name, '');
  assert.equal(settings.footer_message, DEFAULT_TICKET_PRINT_SETTINGS.footer_message);
});

test('normalizeTicketPrintSettings clamps paper width and copies', () => {
  const settings = normalizeTicketPrintSettings({
    paper_width_mm: 40,
    copies: 9,
    brand_name: '  Tacos Pepe  ',
  });
  assert.equal(settings.paper_width_mm, 80);
  assert.equal(settings.copies, 3);
  assert.equal(settings.brand_name, 'Tacos Pepe');
});

test('normalizeTicketPrintSettings keeps 58mm paper', () => {
  const settings = normalizeTicketPrintSettings({ paper_width_mm: 58, copies: 2 });
  assert.equal(settings.paper_width_mm, 58);
  assert.equal(settings.copies, 2);
});

test('shouldPrintKitchenTicket prints takeout on confirm only when auto-print and default printer are set', () => {
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: true,
      orderType: 'takeout',
      trigger: 'confirm',
    }),
    true,
  );
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: true,
      orderType: 'takeout',
      trigger: 'request_rider',
    }),
    false,
  );
});

test('shouldPrintKitchenTicket prints delivery only after requesting rider when auto-print and default printer are set', () => {
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: true,
      orderType: 'delivery',
      trigger: 'confirm',
    }),
    false,
  );
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: true,
      orderType: 'delivery',
      trigger: 'request_rider',
    }),
    true,
  );
});

test('shouldPrintKitchenTicket skips without auto-print or default printer', () => {
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: false,
      hasDefaultPrinter: true,
      orderType: 'takeout',
      trigger: 'confirm',
    }),
    false,
  );
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: false,
      orderType: 'takeout',
      trigger: 'confirm',
    }),
    false,
  );
  assert.equal(
    shouldPrintKitchenTicket({
      enabled: true,
      hasDefaultPrinter: false,
      orderType: 'delivery',
      trigger: 'request_rider',
    }),
    false,
  );
});
