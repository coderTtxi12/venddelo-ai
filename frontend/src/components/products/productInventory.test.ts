import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  calendarDaysBetween,
  effectiveExpiresOn,
  expiryDraftFromProduct,
  expirySavePayload,
  expirySelectValue,
  expiryUrgency,
  inventoryQtyNeedsSave,
  ownerInventoryChips,
  parseInventoryQtyDraft,
  parseOptionalQty,
  parseShelfLifeDaysDraft,
  productExpiryUrgency,
  todayIsoDate,
} from './productInventory';

describe('effectiveExpiresOn', () => {
  it('prefers a custom date over shelf life', () => {
    expect(
      effectiveExpiresOn({
        expiresOn: '2026-08-20',
        shelfLifeDays: 2,
        batchStartedAt: '2026-08-01T15:00:00Z',
      }),
    ).toBe('2026-08-20');
  });

  it('adds shelf life days to the local calendar date of the timestamp', () => {
    const started = new Date('2026-08-01T15:00:00Z');
    expect(
      effectiveExpiresOn({
        expiresOn: null,
        shelfLifeDays: 2,
        batchStartedAt: '2026-08-01T15:00:00Z',
      }),
    ).toBe(addLocalDays(todayIsoDate(started), 2));
  });
});

describe('expiryUrgency', () => {
  it('flags today and past dates', () => {
    expect(expiryUrgency('2026-09-01', '2026-09-01')).toBe('today');
    expect(expiryUrgency('2026-08-31', '2026-09-01')).toBe('expired');
    expect(expiryUrgency('2026-09-02', '2026-09-01')).toBe('none');
    expect(expiryUrgency(null, '2026-09-01')).toBe('none');
  });

  it('uses the effective expiry date of a product', () => {
    expect(
      productExpiryUrgency(
        { expiresOn: '2026-09-01', shelfLifeDays: 7, batchStartedAt: '2026-08-01T15:00:00Z' },
        '2026-09-01',
      ),
    ).toBe('today');
  });
});

describe('addLocalDays', () => {
  it('adds calendar days on the local date, not UTC', () => {
    expect(addLocalDays('2026-09-01', 2)).toBe('2026-09-03');
    expect(addLocalDays('2026-01-30', 2)).toBe('2026-02-01');
  });
});

describe('calendarDaysBetween', () => {
  it('counts whole local calendar days', () => {
    expect(calendarDaysBetween('2026-09-01', '2026-09-01')).toBe(0);
    expect(calendarDaysBetween('2026-09-01', '2026-09-03')).toBe(2);
    expect(calendarDaysBetween('2026-09-03', '2026-09-01')).toBe(-2);
  });
});

describe('ownerInventoryChips', () => {
  it('returns nothing when inventory is not tracked', () => {
    expect(
      ownerInventoryChips({
        inventoryQty: null,
        status: 'active',
        expiresOn: null,
        today: '2026-08-31',
      }),
    ).toEqual([]);
  });

  it('shows stock, sold out, and expiry chips', () => {
    expect(
      ownerInventoryChips({
        inventoryQty: 4,
        status: 'active',
        expiresOn: '2026-08-31',
        today: '2026-08-31',
      }),
    ).toEqual(['4 pzas', 'Caduca hoy']);
    expect(
      ownerInventoryChips({
        inventoryQty: 0,
        status: 'inactive',
        expiresOn: '2026-08-20',
        today: '2026-08-31',
      }),
    ).toEqual(['Agotado', 'Vencida · posible merma']);
  });
});

describe('parseOptionalQty', () => {
  it('treats empty as untracked', () => {
    expect(parseOptionalQty('')).toBeNull();
    expect(parseOptionalQty('8')).toBe(8);
  });
});

describe('parseInventoryQtyDraft', () => {
  it('treats blank as untracked', () => {
    expect(parseInventoryQtyDraft('')).toEqual({ ok: true, qty: null });
    expect(parseInventoryQtyDraft('   ')).toEqual({ ok: true, qty: null });
  });

  it('accepts non-negative integers', () => {
    expect(parseInventoryQtyDraft('0')).toEqual({ ok: true, qty: 0 });
    expect(parseInventoryQtyDraft(' 12 ')).toEqual({ ok: true, qty: 12 });
  });

  it('rejects decimals, signs and text', () => {
    expect(parseInventoryQtyDraft('1.5')).toEqual({ ok: false });
    expect(parseInventoryQtyDraft('-1')).toEqual({ ok: false });
    expect(parseInventoryQtyDraft('abc')).toEqual({ ok: false });
  });
});

describe('inventoryQtyNeedsSave', () => {
  it('does not save unchanged or invalid drafts', () => {
    expect(inventoryQtyNeedsSave('', null)).toBe(false);
    expect(inventoryQtyNeedsSave('8', 8)).toBe(false);
    expect(inventoryQtyNeedsSave('abc', 8)).toBe(false);
  });

  it('saves when tracked qty changes or is cleared', () => {
    expect(inventoryQtyNeedsSave('8', null)).toBe(true);
    expect(inventoryQtyNeedsSave('', 5)).toBe(true);
    expect(inventoryQtyNeedsSave('3', 5)).toBe(true);
  });
});

describe('expiryDraftFromProduct', () => {
  it('prefers an explicit date over shelf life', () => {
    expect(
      expiryDraftFromProduct({ expiresOn: '2026-09-01', shelfLifeDays: 2 }),
    ).toEqual({ mode: 'date', date: '2026-09-01' });
  });

  it('uses shelf life days when there is no date', () => {
    expect(expiryDraftFromProduct({ expiresOn: null, shelfLifeDays: 7 })).toEqual({
      mode: 'days',
      days: 7,
    });
  });

  it('is none when both fields are empty', () => {
    expect(expiryDraftFromProduct({ expiresOn: null, shelfLifeDays: null })).toEqual({
      mode: 'none',
    });
  });
});

describe('expirySelectValue', () => {
  it('maps presets, today, custom days and date', () => {
    expect(expirySelectValue({ mode: 'none' })).toBe('none');
    expect(expirySelectValue({ mode: 'days', days: 1 })).toBe('1');
    expect(expirySelectValue({ mode: 'days', days: 2 })).toBe('2');
    expect(expirySelectValue({ mode: 'days', days: 7 })).toBe('7');
    expect(expirySelectValue({ mode: 'days', days: 5 })).toBe('custom');
    expect(expirySelectValue({ mode: 'date', date: '2026-09-04' }, '2026-08-31')).toBe('date');
    expect(expirySelectValue({ mode: 'date', date: '2026-08-31' }, '2026-08-31')).toBe('today');
    expect(expirySelectValue({ mode: 'date', date: '2026-09-01' }, '2026-08-31')).toBe('1');
    expect(expirySelectValue({ mode: 'date', date: '2026-09-02' }, '2026-08-31')).toBe('2');
    expect(expirySelectValue({ mode: 'date', date: '2026-09-07' }, '2026-08-31')).toBe('7');
  });
});

describe('parseShelfLifeDaysDraft', () => {
  it('requires a positive integer', () => {
    expect(parseShelfLifeDaysDraft('7')).toEqual({ ok: true, days: 7 });
    expect(parseShelfLifeDaysDraft('0')).toEqual({ ok: false });
    expect(parseShelfLifeDaysDraft('')).toEqual({ ok: false });
    expect(parseShelfLifeDaysDraft('1.5')).toEqual({ ok: false });
  });
});

describe('expirySavePayload', () => {
  const today = '2026-09-01';

  it('returns null when the draft did not change', () => {
    expect(expirySavePayload({ mode: 'none' }, { mode: 'none' }, today)).toBeNull();
    expect(
      expirySavePayload({ mode: 'days', days: 2 }, { mode: 'date', date: '2026-09-03' }, today),
    ).toBeNull();
  });

  it('clears both expiry fields', () => {
    expect(expirySavePayload({ mode: 'none' }, { mode: 'days', days: 2 }, today)).toEqual({
      expiresOn: null,
      shelfLifeDays: null,
    });
  });

  it('writes a local calendar date for relative days and drops shelf life', () => {
    expect(
      expirySavePayload({ mode: 'days', days: 2 }, { mode: 'none' }, today),
    ).toEqual({ expiresOn: '2026-09-03', shelfLifeDays: null });
    expect(
      expirySavePayload({ mode: 'days', days: 7 }, { mode: 'date', date: '2026-09-01' }, today),
    ).toEqual({ expiresOn: '2026-09-08', shelfLifeDays: null });
  });

  it('writes an explicit date and drops shelf life', () => {
    expect(
      expirySavePayload(
        { mode: 'date', date: '2026-09-10' },
        { mode: 'days', days: 2 },
        today,
      ),
    ).toEqual({ expiresOn: '2026-09-10', shelfLifeDays: null });
  });

  it('does not save an incomplete custom date or days', () => {
    expect(
      expirySavePayload({ mode: 'date', date: '' }, { mode: 'none' }, today),
    ).toBeNull();
    expect(
      expirySavePayload({ mode: 'days', days: 0 }, { mode: 'none' }, today),
    ).toBeNull();
  });
});
