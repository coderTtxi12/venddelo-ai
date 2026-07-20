import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsPeriodSearchParams,
  formatCustomRangeLabel,
  parseAnalyticsPeriodSearchParams,
} from './period';

describe('parseAnalyticsPeriodSearchParams', () => {
  it('defaults to 12m', () => {
    expect(parseAnalyticsPeriodSearchParams(new URLSearchParams())).toEqual({
      preset: '12m',
      start: null,
      end: null,
    });
  });

  it('parses custom range', () => {
    const params = new URLSearchParams('preset=custom&start=2026-03-03&end=2026-03-18');
    expect(parseAnalyticsPeriodSearchParams(params)).toEqual({
      preset: 'custom',
      start: '2026-03-03',
      end: '2026-03-18',
    });
  });
});

describe('buildAnalyticsPeriodSearchParams', () => {
  it('includes custom dates', () => {
    const params = buildAnalyticsPeriodSearchParams({
      preset: 'custom',
      start: '2026-03-03',
      end: '2026-03-18',
    });
    expect(params.get('preset')).toBe('custom');
    expect(params.get('start')).toBe('2026-03-03');
    expect(params.get('end')).toBe('2026-03-18');
  });
});

describe('formatCustomRangeLabel', () => {
  it('formats es-MX short range', () => {
    expect(formatCustomRangeLabel('2026-03-03', '2026-03-18')).toMatch(/3 mar.*18 mar/i);
  });
});
