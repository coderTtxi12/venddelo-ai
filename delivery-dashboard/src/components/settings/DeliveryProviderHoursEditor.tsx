'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type {
  DeliveryProviderSchedule,
  DeliveryProviderScheduleCreateInput,
  DeliveryProviderScheduleKind,
} from '@/lib/api/types';
import {
  buildScheduleDrafts,
  createDefaultSlot,
  SCHEDULE_KIND_ORDER,
  scheduleDraftsToCreatePayload,
  type DayScheduleDraft,
  type KindScheduleDraft,
  validateScheduleDrafts,
} from '@/lib/schedule/providerScheduleHours';
import styles from './DeliveryProviderHoursEditor.module.css';

type DeliveryProviderHoursEditorProps = {
  schedules: DeliveryProviderSchedule[];
  saving?: boolean;
  onSave: (payload: DeliveryProviderScheduleCreateInput[]) => Promise<void>;
};

function DayScheduleEditor({
  day,
  scheduleKind,
  onChange,
}: {
  day: DayScheduleDraft;
  scheduleKind: DeliveryProviderScheduleKind;
  onChange: (next: DayScheduleDraft) => void;
}) {
  const toggleClosed = () => {
    if (day.isClosed) {
      onChange({ ...day, isClosed: false, slots: [createDefaultSlot(scheduleKind)] });
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
    onChange({ ...day, slots: [...day.slots, createDefaultSlot(scheduleKind)] });
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
    <li className={`${styles.dayRow} ${day.isToday ? styles.dayRowToday : ''}`}>
      <div className={styles.dayMeta}>
        <span className={styles.dayLabel}>
          {day.label}
          {day.isToday ? <span className={styles.todayBadge}>Hoy</span> : null}
        </span>
        <button
          type="button"
          className={`${styles.closedToggle} ${day.isClosed ? styles.closedToggleOff : styles.closedToggleOn}`}
          onClick={toggleClosed}
          aria-pressed={!day.isClosed}
        >
          {day.isClosed ? 'Cerrado' : 'Abierto'}
        </button>
      </div>

      {day.isClosed ? (
        <p className={styles.closedHint}>Sin reparto este día</p>
      ) : (
        <div className={styles.slotsWrap}>
          {day.slots.map((slot, index) => (
            <div key={`${day.dayIndex}-${index}`} className={styles.slotRow}>
              <div className={styles.timeFields}>
                <label className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Inicio</span>
                  <input
                    type="time"
                    className={styles.timeInput}
                    value={slot.opensAt}
                    onChange={(e) => updateSlot(index, 'opensAt', e.target.value)}
                  />
                </label>
                <span className={styles.timeSep} aria-hidden>
                  –
                </span>
                <label className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Fin</span>
                  <input
                    type="time"
                    className={styles.timeInput}
                    value={slot.closesAt}
                    onChange={(e) => updateSlot(index, 'closesAt', e.target.value)}
                  />
                </label>
              </div>
              {day.slots.length > 1 ? (
                <button
                  type="button"
                  className={styles.removeSlotBtn}
                  aria-label={`Quitar turno ${index + 1} de ${day.label}`}
                  onClick={() => removeSlot(index)}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className={styles.addSlotBtn} onClick={addSlot}>
            <AddOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
            Agregar turno
          </button>
        </div>
      )}
    </li>
  );
}

function kindBlockSummary(days: DayScheduleDraft[]): string {
  const openDays = days.filter((day) => !day.isClosed).length;
  if (openDays === 0) return 'Sin días con reparto';
  if (openDays === 7) return 'Activo los 7 días';
  return `${openDays} ${openDays === 1 ? 'día activo' : 'días activos'}`;
}

function KindScheduleBlock({
  block,
  expanded,
  onToggle,
  onChangeDay,
}: {
  block: KindScheduleDraft;
  expanded: boolean;
  onToggle: () => void;
  onChangeDay: (dayIndex: number, next: DayScheduleDraft) => void;
}) {
  const panelId = `provider-hours-panel-${block.scheduleKind}`;

  return (
    <div className={`${styles.hoursBlock} ${expanded ? styles.hoursBlockOpen : ''}`}>
      <button
        type="button"
        className={styles.serviceToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={styles.serviceToggleMain}>
          <span className={styles.serviceTitle}>{block.label}</span>
          {!expanded ? (
            <span className={styles.serviceSummary}>{kindBlockSummary(block.days)}</span>
          ) : null}
        </span>
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} aria-hidden />
        </span>
      </button>

      <div id={panelId} className={styles.servicePanel} hidden={!expanded}>
        <ul className={styles.dayList}>
          {block.days.map((day) => (
            <DayScheduleEditor
              key={`${block.scheduleKind}-${day.dayIndex}`}
              day={day}
              scheduleKind={block.scheduleKind}
              onChange={(next) => onChangeDay(day.dayIndex, next)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DeliveryProviderHoursEditor({
  schedules,
  saving = false,
  readOnly = false,
  onSave,
}: DeliveryProviderHoursEditorProps) {
  const [drafts, setDrafts] = useState<KindScheduleDraft[]>(() =>
    buildScheduleDrafts(schedules, SCHEDULE_KIND_ORDER),
  );
  const [expandedKind, setExpandedKind] = useState<DeliveryProviderScheduleKind | null>('regular');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDrafts(buildScheduleDrafts(schedules, SCHEDULE_KIND_ORDER));
    setDirty(false);
    setValidationError(null);
  }, [schedules]);

  const updateBlock = useCallback(
    (scheduleKind: DeliveryProviderScheduleKind, days: DayScheduleDraft[]) => {
      setDrafts((prev) =>
        prev.map((block) => (block.scheduleKind === scheduleKind ? { ...block, days } : block)),
      );
      setDirty(true);
      setValidationError(null);
    },
    [],
  );

  const handleSave = async () => {
    const error = validateScheduleDrafts(drafts);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    await onSave(scheduleDraftsToCreatePayload(drafts));
    setDirty(false);
  };

  return (
    <section className={styles.hoursSection} aria-labelledby="provider-hours-title">
      <div className={styles.hoursHeader}>
        <AccessTimeOutlinedIcon className={styles.hoursIcon} aria-hidden />
        <div>
          <h3 id="provider-hours-title" className={styles.hoursTitle}>
            Horarios de reparto
          </h3>
            <p className={styles.hoursHint}>
            Define cuándo aceptas pedidos. Por defecto: diurno 9:00 a.m.–9:00 p.m. y nocturno
            9:00 p.m.–10:00 p.m., todos los días. El horario nocturno solo aplica dentro de tu
            zona de cobertura; fuera del polígono solo cuenta el horario diurno.
          </p>
        </div>
      </div>

      <div className={styles.hoursBlocks}>
        {drafts.map((block) => (
          <KindScheduleBlock
            key={block.scheduleKind}
            block={block}
            expanded={expandedKind === block.scheduleKind}
            onToggle={() =>
              setExpandedKind((prev) => (prev === block.scheduleKind ? null : block.scheduleKind))
            }
            onChangeDay={(dayIndex, next) => {
              const days = block.days.map((day) => (day.dayIndex === dayIndex ? next : day));
              updateBlock(block.scheduleKind, days);
            }}
          />
        ))}
      </div>

      <div className={styles.footer}>
        {validationError ? (
          <p className={styles.errorText} role="alert">
            {validationError}
          </p>
        ) : null}
        <button
          type="button"
          className={styles.saveBtn}
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando horarios…' : 'Guardar horarios'}
        </button>
      </div>
    </section>
  );
}
