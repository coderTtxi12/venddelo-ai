import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AFFILIATE_GOAL,
  addIsoDays,
  affiliateChartRows,
  affiliateForecastSentence,
  buildAffiliateGoal,
  formatSpanishDay,
  formatWeekLabel,
  mexicoDay,
  parseAffiliateExclusions,
  serializeAffiliateExclusions,
  type AffiliateRecord,
} from './affiliateGoal';

const TODAY = '2026-09-30';

function record(
  restaurantId: string,
  activatedAt: string,
  onHold = false,
): AffiliateRecord {
  return { restaurantId, activatedAt, onHold };
}

test('mexicoDay uses America/Mexico_City without daylight saving', () => {
  assert.equal(mexicoDay('2026-09-01T05:30:00.000Z'), '2026-08-31');
  assert.equal(mexicoDay('2026-09-01T06:00:00.000Z'), '2026-09-01');
});

test('week labels stay short across a month boundary', () => {
  assert.equal(formatWeekLabel('2026-09-01', '2026-09-07'), '1–7 sep');
  assert.equal(formatWeekLabel('2026-09-29', '2026-10-05'), '29 sep–5 oct');
  assert.equal(formatSpanishDay('2027-01-18'), '18 ene 2027');
});

test('snapshot counts sin hold, attributes holds to the affiliation week, and projects from September', () => {
  const snapshot = buildAffiliateGoal(
    [
      record('legacy', '2026-08-20T18:00:00.000Z'),
      record('legacy-hold', '2026-08-25T18:00:00.000Z', true),
      record('week-1', '2026-09-03T18:00:00.000Z'),
      record('week-2-hold', '2026-09-10T18:00:00.000Z', true),
      record('current', '2026-09-30T18:00:00.000Z'),
      record('test', '2026-09-04T18:00:00.000Z'),
    ],
    ['test'],
    TODAY,
  );

  assert.equal(snapshot.goal, AFFILIATE_GOAL);
  assert.equal(snapshot.active, 3);
  assert.equal(snapshot.onHold, 2);
  assert.equal(snapshot.excluded, 1);
  assert.equal(snapshot.baselineActive, 1);
  assert.equal(snapshot.septemberJoined, 3);
  assert.equal(snapshot.septemberHold, 1);
  assert.equal(snapshot.weeks.length, 5);
  assert.equal(snapshot.weeks[0].label, '1–7 sep');
  assert.equal(snapshot.weeks[0].joinedActive, 1);
  assert.equal(snapshot.weeks[1].joinedHold, 1);
  assert.equal(snapshot.weeks[4].partial, true);
  assert.equal(snapshot.weeks[4].joinedActive, 1);
  assert.equal(snapshot.weeks[4].cumulativeActive, 3);
  assert.ok(snapshot.weeklyNet > 0);
  assert.equal(snapshot.reached, false);
  assert.equal(snapshot.projectedDate, addIsoDays(TODAY, 1455));
  assert.equal(snapshot.forecast.length, 18);

  const rows = affiliateChartRows(snapshot);
  const junction = rows[snapshot.weeks.length - 1];
  assert.equal(junction.cumulative, 3);
  assert.equal(junction.forecast, 3);
  assert.equal(rows.at(-1)?.cumulative, null);
  assert.equal(rows.at(-1)?.forecast, snapshot.forecast.at(-1)?.value);
});

test('a faster September pace draws the forecast through the goal', () => {
  const records = [record('legacy', '2026-08-20T18:00:00.000Z')];
  for (let day = 1; day <= 28; day += 1) {
    records.push(record(`sep-${day}`, `2026-09-${String(day).padStart(2, '0')}T18:00:00.000Z`));
  }
  const snapshot = buildAffiliateGoal(records, [], TODAY);
  assert.ok(snapshot.forecast.length > 1);
  assert.ok(snapshot.forecast.length <= 18);
  assert.ok(snapshot.forecast.at(-1)!.value >= AFFILIATE_GOAL);
  assert.match(affiliateForecastSentence(snapshot), /alrededor del/);
});

test('a September hold stays in the chart and out of the projection date', () => {
  const joined = Array.from({ length: 20 }, (_, index) =>
    record(`sep-${index}`, `2026-09-${String((index % 28) + 1).padStart(2, '0')}T18:00:00.000Z`),
  );
  const held = record('wild', '2026-09-05T18:00:00.000Z', true);
  const base = [record('legacy', '2026-08-20T18:00:00.000Z'), ...joined];
  const clean = buildAffiliateGoal(base, [], TODAY);
  const withHold = buildAffiliateGoal([...base, held], [], TODAY);
  const excluded = buildAffiliateGoal([...base, held], ['wild'], TODAY);

  assert.equal(withHold.projectedDate, clean.projectedDate);
  assert.equal(withHold.septemberHold, 1);
  assert.ok(withHold.weeks.some((week) => week.joinedHold > 0));
  assert.equal(excluded.projectedDate, clean.projectedDate);
  assert.equal(excluded.septemberHold, 0);
  assert.equal(excluded.onHold, 0);
  assert.equal(excluded.excluded, 1);
});

test('a flat September pace does not invent a date for the goal', () => {
  const snapshot = buildAffiliateGoal(
    [record('legacy', '2026-08-20T18:00:00.000Z'), record('held', '2026-09-08T18:00:00.000Z', true)],
    [],
    TODAY,
  );
  assert.equal(snapshot.active, 1);
  assert.equal(snapshot.weeklyNet, 0);
  assert.equal(snapshot.projectedDate, null);
  assert.equal(snapshot.forecast.length, 0);
  assert.match(affiliateForecastSentence(snapshot), /no hay fecha/);
});

test('reaching 100 closes the forecast', () => {
  const records = Array.from({ length: 100 }, (_, index) =>
    record(`r-${index}`, '2026-08-20T18:00:00.000Z'),
  );
  const snapshot = buildAffiliateGoal(records, [], TODAY);
  assert.equal(snapshot.reached, true);
  assert.equal(snapshot.projectedDate, TODAY);
  assert.equal(snapshot.forecast.length, 0);
  assert.match(affiliateForecastSentence(snapshot), /ya está cubierta/);
});

test('exclusions round-trip as unique restaurant ids', () => {
  const raw = serializeAffiliateExclusions(['wild', 'wild', '', 'rooster']);
  assert.deepEqual(parseAffiliateExclusions(raw), ['wild', 'rooster']);
  assert.deepEqual(parseAffiliateExclusions('nope'), []);
  assert.equal(addIsoDays('2026-09-30', 7), '2026-10-07');
});
