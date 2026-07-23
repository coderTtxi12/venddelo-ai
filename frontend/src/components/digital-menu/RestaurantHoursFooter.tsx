'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type { RestaurantSchedule, RestaurantScheduleCreateInput } from '@/lib/api/types';
import {
  buildScheduleDrafts,
  createDefaultSlot,
  scheduleDraftsToCreatePayload,
  type DayScheduleDraft,
  type ServiceScheduleDraft,
  validateScheduleDrafts,
} from '@/lib/restaurantScheduleHours';
import {
  RESTAURANT_SERVICE_ORDER,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';
import styles from './RestaurantHoursFooter.module.css';

type RestaurantHoursFooterProps = {
  schedules: RestaurantSchedule[];
  serviceTypes?: RestaurantServiceType[];
  saving?: boolean;
  onSave: (payload: RestaurantScheduleCreateInput[]) => Promise<void>;
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
      onChange({ ...day, isClosed: false, slots: [createDefaultSlot()] });
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
    onChange({ ...day, slots: [...day.slots, createDefaultSlot()] });
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
        <p className={styles.closedHint}>Sin servicio este día</p>
      ) : (
        <div className={styles.slotsWrap}>
          {day.slots.map((slot, index) => (
            <div key={`${day.dayIndex}-${index}`} className={styles.slotRow}>
              <div className={styles.timeFields}>
                <label className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Abre</span>
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
                  <span className={styles.timeFieldLabel}>Cierra</span>
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

function serviceBlockSummary(days: DayScheduleDraft[]): string {
  const openDays = days.filter((day) => !day.isClosed).length;
  if (openDays === 0) return 'Sin días con servicio';
  if (openDays === 7) return 'Abierto los 7 días';
  return `${openDays} ${openDays === 1 ? 'día abierto' : 'días abiertos'}`;
}

function ServiceScheduleBlock({
  block,
  expanded,
  onToggle,
  onChangeDay,
}: {
  block: ServiceScheduleDraft;
  expanded: boolean;
  onToggle: () => void;
  onChangeDay: (dayIndex: number, next: DayScheduleDraft) => void;
}) {
  const panelId = `hours-panel-${block.serviceType}`;

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
            <span className={styles.serviceSummary}>{serviceBlockSummary(block.days)}</span>
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
              key={`${block.serviceType}-${day.dayIndex}`}
              day={day}
              onChange={(next) => onChangeDay(day.dayIndex, next)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RestaurantHoursFooter({
  schedules,
  serviceTypes = RESTAURANT_SERVICE_ORDER,
  saving = false,
  onSave,
}: RestaurantHoursFooterProps) {
  const [drafts, setDrafts] = useState<ServiceScheduleDraft[]>(() =>
    buildScheduleDrafts(schedules, serviceTypes),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<RestaurantServiceType, boolean>>({
    takeout: true,
    delivery: true,
  });

  useEffect(() => {
    setDrafts(buildScheduleDrafts(schedules, serviceTypes));
    setDirty(false);
    setError(null);
  }, [schedules, serviceTypes]);

  const updateBlock = useCallback((serviceType: ServiceScheduleDraft['serviceType'], days: DayScheduleDraft[]) => {
    setDrafts((current) =>
      current.map((block) => (block.serviceType === serviceType ? { ...block, days } : block)),
    );
    setDirty(true);
    setError(null);
  }, []);

  const toggleBlock = useCallback((serviceType: RestaurantServiceType) => {
    setExpandedBlocks((current) => ({
      ...current,
      [serviceType]: !current[serviceType],
    }));
  }, []);

  const handleSave = async () => {
    const validationError = validateScheduleDrafts(drafts);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      await onSave(scheduleDraftsToCreatePayload(drafts));
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar el horario. Inténtalo de nuevo.');
    }
  };

  return (
    <section className={styles.hoursSection} aria-label="Horario del restaurante">
      <div className={styles.hoursHeader}>
        <AccessTimeOutlinedIcon className={styles.hoursIcon} aria-hidden />
        <div className={styles.hoursHeading}>
          <h2 className={styles.hoursTitle}>Horarios de Servicio</h2>
          <p className={styles.hoursHint}>Configura los días y turnos de cada servicio.</p>
        </div>
      </div>

      <div className={styles.hoursBlocks}>
        {drafts.map((block) => (
          <ServiceScheduleBlock
            key={block.serviceType}
            block={block}
            expanded={expandedBlocks[block.serviceType]}
            onToggle={() => toggleBlock(block.serviceType)}
            onChangeDay={(dayIndex, next) => {
              const days = block.days.map((entry) => (entry.dayIndex === dayIndex ? next : entry));
              updateBlock(block.serviceType, days);
            }}
          />
        ))}
      </div>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.saveBtn}
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : dirty ? 'Guardar horario' : 'Horario guardado'}
        </button>
      </div>
    </section>
  );
}
