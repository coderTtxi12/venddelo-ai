'use client';

import { useCallback } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import type {
  DayScheduleDraft,
  ServiceScheduleDraft,
} from '@/lib/restaurantScheduleHours';
import { createOnboardingDefaultSlot, normalizeOnboardingScheduleDrafts, ONBOARDING_SCHEDULE_LABEL } from '@/lib/onboarding/schedule';
import { validateScheduleDrafts } from '@/lib/restaurantScheduleHours';
import hoursStyles from '@/components/digital-menu/RestaurantHoursFooter.module.css';
import styles from './OnboardingScheduleEditor.module.css';

type OnboardingScheduleEditorProps = {
  drafts: ServiceScheduleDraft[];
  onChange: (drafts: ServiceScheduleDraft[]) => void;
  onValidationError?: (message: string | null) => void;
};

function DayScheduleEditor({
  day,
  onChange,
}: {
  day: DayScheduleDraft;
  onChange: (next: DayScheduleDraft) => void;
}) {
  const toggleClosed = () => {
    if (day.isClosed) {
      onChange({ ...day, isClosed: false, slots: [createOnboardingDefaultSlot()] });
      return;
    }
    onChange({ ...day, isClosed: true, slots: [] });
  };

  const updateSlot = (index: number, field: 'opensAt' | 'closesAt', value: string) => {
    const slots = day.slots.map((slot, slotIndex) =>
      slotIndex === index ? { ...slot, [field]: value } : slot,
    );
    onChange({ ...day, slots });
  };

  const addSlot = () => {
    onChange({ ...day, slots: [...day.slots, createOnboardingDefaultSlot()] });
  };

  const removeSlot = (index: number) => {
    const slots = day.slots.filter((_, slotIndex) => slotIndex !== index);
    onChange({
      ...day,
      slots,
      isClosed: slots.length === 0,
    });
  };

  return (
    <li className={`${hoursStyles.dayRow} ${day.isToday ? hoursStyles.dayRowToday : ''}`}>
      <div className={hoursStyles.dayMeta}>
        <span className={hoursStyles.dayLabel}>
          {day.label}
          {day.isToday ? <span className={hoursStyles.todayBadge}>Hoy</span> : null}
        </span>
        <button
          type="button"
          className={`${hoursStyles.closedToggle} ${day.isClosed ? hoursStyles.closedToggleOff : hoursStyles.closedToggleOn}`}
          onClick={toggleClosed}
          aria-pressed={!day.isClosed}
        >
          {day.isClosed ? 'Cerrado' : 'Abierto'}
        </button>
      </div>

      {day.isClosed ? (
        <p className={hoursStyles.closedHint}>Sin servicio este día</p>
      ) : (
        <div className={hoursStyles.slotsWrap}>
          {day.slots.map((slot, index) => (
            <div key={`${day.dayIndex}-${index}`} className={hoursStyles.slotRow}>
              <div className={hoursStyles.timeFields}>
                <label className={hoursStyles.timeField}>
                  <span className={hoursStyles.timeFieldLabel}>Abre</span>
                  <input
                    type="time"
                    className={hoursStyles.timeInput}
                    value={slot.opensAt}
                    onChange={(e) => updateSlot(index, 'opensAt', e.target.value)}
                  />
                </label>
                <span className={hoursStyles.timeSep} aria-hidden>
                  –
                </span>
                <label className={hoursStyles.timeField}>
                  <span className={hoursStyles.timeFieldLabel}>Cierra</span>
                  <input
                    type="time"
                    className={hoursStyles.timeInput}
                    value={slot.closesAt}
                    onChange={(e) => updateSlot(index, 'closesAt', e.target.value)}
                  />
                </label>
              </div>
              {day.slots.length > 1 ? (
                <button
                  type="button"
                  className={hoursStyles.removeSlotBtn}
                  aria-label={`Quitar turno ${index + 1} de ${day.label}`}
                  onClick={() => removeSlot(index)}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className={hoursStyles.addSlotBtn} onClick={addSlot}>
            <AddOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
            Agregar turno
          </button>
        </div>
      )}
    </li>
  );
}

export function OnboardingScheduleEditor({
  drafts,
  onChange,
  onValidationError,
}: OnboardingScheduleEditorProps) {
  const schedule = normalizeOnboardingScheduleDrafts(drafts)[0]!;

  const updateDays = useCallback(
    (days: DayScheduleDraft[]) => {
      const next: ServiceScheduleDraft[] = [{ ...schedule, days }];
      onChange(next);
      onValidationError?.(validateScheduleDrafts(next));
    },
    [onChange, onValidationError, schedule],
  );

  return (
    <section className={styles.wrap} aria-label={ONBOARDING_SCHEDULE_LABEL}>
      <div className={hoursStyles.hoursHeader}>
        <AccessTimeOutlinedIcon className={hoursStyles.hoursIcon} aria-hidden />
        <div className={hoursStyles.hoursHeading}>
          <p className={styles.inlineHint}>
            Horario predeterminado: 9:00 a.m. – 11:00 p.m. todos los días. Ajústalo si lo necesitas.
          </p>
        </div>
      </div>

      <h3 className={styles.sectionTitle}>{ONBOARDING_SCHEDULE_LABEL}</h3>

      <ul className={hoursStyles.dayList}>
        {schedule.days.map((day) => (
          <DayScheduleEditor
            key={day.dayIndex}
            day={day}
            onChange={(next) => {
              const days = schedule.days.map((entry) =>
                entry.dayIndex === day.dayIndex ? next : entry,
              );
              updateDays(days);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
