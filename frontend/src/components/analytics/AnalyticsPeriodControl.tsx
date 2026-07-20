'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays, parse, startOfToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import type { AnalyticsPeriodState } from '@/lib/analytics/period';
import {
  ANALYTICS_PRESET_OPTIONS,
  formatCustomRangeLabel,
  formatDateToIso,
  getPresetOptionLabel,
} from '@/lib/analytics/period';
import styles from './AnalyticsPeriodControl.module.css';

const MAX_CUSTOM_RANGE_DAYS = 366;

function isoToLocalDate(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date());
}

function toSelectedRange(start: string, end: string): DateRange | undefined {
  if (!start) return undefined;
  return {
    from: isoToLocalDate(start),
    to: end ? isoToLocalDate(end) : undefined,
  };
}

type AnalyticsDateRangePopoverProps = {
  open: boolean;
  draftStart: string;
  draftEnd: string;
  onDraftRangeChange: (start: string, end: string) => void;
  onApply: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function AnalyticsDateRangePopover({
  open,
  draftStart,
  draftEnd,
  onDraftRangeChange,
  onApply,
  onCancel,
  disabled = false,
}: AnalyticsDateRangePopoverProps) {
  const today = startOfToday();
  const selected = useMemo(
    () => toSelectedRange(draftStart, draftEnd),
    [draftStart, draftEnd],
  );

  const inclusiveDays =
    draftStart && draftEnd
      ? differenceInCalendarDays(isoToLocalDate(draftEnd), isoToLocalDate(draftStart)) + 1
      : 0;
  const rangeTooLong = inclusiveDays > MAX_CUSTOM_RANGE_DAYS;
  const canApply = Boolean(draftStart && draftEnd && draftStart <= draftEnd && !rangeTooLong);

  if (!open) return null;

  return (
    <div className={styles.popover} role="dialog" aria-label="Rango de fechas personalizado">
      <p className={styles.popoverTitle}>Selecciona un rango</p>
      {draftStart && draftEnd && (
        <p className={styles.popoverSummary}>
          {formatCustomRangeLabel(draftStart, draftEnd)}
        </p>
      )}
      <div className={styles.calendar}>
        <DayPicker
          mode="range"
          locale={es}
          numberOfMonths={1}
          selected={selected}
          disabled={{ after: today }}
          onSelect={(range) => {
            onDraftRangeChange(
              range?.from ? formatDateToIso(range.from) : '',
              range?.to ? formatDateToIso(range.to) : '',
            );
          }}
        />
      </div>
      {rangeTooLong && (
        <p className={styles.popoverError}>El rango no puede superar {MAX_CUSTOM_RANGE_DAYS} días.</p>
      )}
      <div className={styles.popoverActions}>
        <button type="button" className={styles.popoverButton} disabled={disabled} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className={`${styles.popoverButton} ${styles.popoverButtonPrimary}`}
          disabled={disabled || !canApply}
          onClick={onApply}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

type AnalyticsPeriodControlProps = {
  value: AnalyticsPeriodState;
  refreshing: boolean;
  onChange: (next: AnalyticsPeriodState) => void;
};

export default function AnalyticsPeriodControl({
  value,
  refreshing,
  onChange,
}: AnalyticsPeriodControlProps) {
  const tablistId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.start ?? '');
  const [draftEnd, setDraftEnd] = useState(value.end ?? '');

  useEffect(() => {
    if (!customOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setCustomOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [customOpen]);

  const handlePresetClick = (preset: AnalyticsPeriodState['preset']) => {
    if (preset === 'custom') {
      setDraftStart(value.start ?? '');
      setDraftEnd(value.end ?? '');
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({ preset, start: null, end: null });
  };

  const handleApplyCustom = () => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return;
    const inclusiveDays =
      differenceInCalendarDays(isoToLocalDate(draftEnd), isoToLocalDate(draftStart)) + 1;
    if (inclusiveDays > MAX_CUSTOM_RANGE_DAYS) return;
    setCustomOpen(false);
    onChange({ preset: 'custom', start: draftStart, end: draftEnd });
  };

  return (
    <div className={styles.popoverWrap} ref={popoverRef}>
      <div
        className={styles.periodControl}
        role="tablist"
        aria-label="Periodo de analíticas"
        id={tablistId}
      >
        {ANALYTICS_PRESET_OPTIONS.map((option) => {
          const isActive =
            option.preset === 'custom'
              ? value.preset === 'custom'
              : value.preset === option.preset;
          const label =
            option.preset === 'custom'
              ? getPresetOptionLabel('custom', value)
              : option.label;

          return (
            <button
              key={option.preset}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.periodTab} ${isActive ? styles.periodTabActive : ''}`}
              disabled={refreshing}
              onClick={() => handlePresetClick(option.preset)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <AnalyticsDateRangePopover
        open={customOpen}
        draftStart={draftStart}
        draftEnd={draftEnd}
        disabled={refreshing}
        onDraftRangeChange={(start, end) => {
          setDraftStart(start);
          setDraftEnd(end);
        }}
        onApply={handleApplyCustom}
        onCancel={() => setCustomOpen(false)}
      />
    </div>
  );
}
