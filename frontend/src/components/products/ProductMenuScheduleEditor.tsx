'use client';

import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import {
  DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT,
  formatProductMenuScheduleSummary,
  PRODUCT_MENU_WEEKDAY_SHORT,
  productMenuScheduleToApi,
  toggleProductMenuWeekday,
  type ProductMenuScheduleDraft,
} from '@/lib/menu/productMenuSchedule';
import { WEEKDAY_LABELS } from '@/lib/restaurantScheduleHours';
import styles from './ProductMenuScheduleEditor.module.css';

type ProductMenuScheduleEditorProps = {
  value: ProductMenuScheduleDraft;
  onChange: (next: ProductMenuScheduleDraft) => void;
  disabled?: boolean;
};

const PRESETS: { id: string; label: string; draft: ProductMenuScheduleDraft }[] = [
  {
    id: 'mornings',
    label: 'Mañanas',
    draft: {
      enabled: true,
      useWeekdays: false,
      weekdays: [],
      useTimeWindow: true,
      dailyStartTime: '07:00',
      dailyEndTime: '12:00',
    },
  },
  {
    id: 'nights',
    label: 'Noches',
    draft: {
      enabled: true,
      useWeekdays: false,
      weekdays: [],
      useTimeWindow: true,
      dailyStartTime: '19:00',
      dailyEndTime: '23:00',
    },
  },
  {
    id: 'weekend',
    label: 'Fin de semana',
    draft: {
      enabled: true,
      useWeekdays: true,
      weekdays: [5, 6],
      useTimeWindow: false,
      dailyStartTime: '09:00',
      dailyEndTime: '22:00',
    },
  },
];

const CUSTOM_DRAFT: ProductMenuScheduleDraft = {
  enabled: true,
  useWeekdays: true,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  useTimeWindow: true,
  dailyStartTime: '09:00',
  dailyEndTime: '22:00',
};

function draftsMatch(a: ProductMenuScheduleDraft, b: ProductMenuScheduleDraft): boolean {
  return (
    a.enabled === b.enabled &&
    a.useWeekdays === b.useWeekdays &&
    a.useTimeWindow === b.useTimeWindow &&
    a.dailyStartTime === b.dailyStartTime &&
    a.dailyEndTime === b.dailyEndTime &&
    a.weekdays.length === b.weekdays.length &&
    a.weekdays.every((day, index) => day === b.weekdays[index])
  );
}

export function ProductMenuScheduleEditor({
  value,
  onChange,
  disabled = false,
}: ProductMenuScheduleEditorProps) {
  const summary = value.enabled
    ? formatProductMenuScheduleSummary(productMenuScheduleToApi(value))
    : null;
  const customActive = value.enabled && !PRESETS.some((preset) => draftsMatch(value, preset.draft));

  return (
    <section className={styles.card} aria-labelledby="product-menu-schedule-title">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden>
          <ScheduleOutlinedIcon fontSize="small" />
        </span>
        <div className={styles.headerCopy}>
          <h3 id="product-menu-schedule-title" className={styles.title}>
            Horario en el menú
          </h3>
          <p className={styles.hint}>
            Elige cuándo aparece en el menú público. Sin horario, sigue el estado del producto.
          </p>
        </div>
        <button
          type="button"
          className={value.enabled ? `${styles.switch} ${styles.switchOn}` : styles.switch}
          role="switch"
          aria-checked={value.enabled}
          aria-label="Visibilidad programada"
          disabled={disabled}
          onClick={() =>
            onChange(
              value.enabled
                ? { ...DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT }
                : { ...value, enabled: true, useTimeWindow: true },
            )
          }
        >
          <span className={styles.switchKnob} />
        </button>
      </div>

      <div className={styles.presets} role="group" aria-label="Atajos de horario">
        {PRESETS.map((preset) => {
          const active = draftsMatch(value, preset.draft);
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              className={active ? `${styles.preset} ${styles.presetActive}` : styles.preset}
              aria-pressed={active}
              onClick={() => onChange(preset.draft)}
            >
            {preset.label}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        className={customActive ? `${styles.preset} ${styles.presetActive}` : styles.preset}
        aria-pressed={customActive}
        onClick={() => {
          if (customActive) return;
          onChange(CUSTOM_DRAFT);
        }}
      >
        Personalizado
      </button>
    </div>

      {value.enabled ? (
        <div className={styles.body}>
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>Días</span>
              <button
                type="button"
                className={styles.linkBtn}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    useWeekdays: !value.useWeekdays,
                    weekdays: value.useWeekdays ? [] : value.weekdays,
                  })
                }
              >
                {value.useWeekdays ? 'Todos los días' : 'Elegir días'}
              </button>
            </div>
            {value.useWeekdays ? (
              <div className={styles.weekdayRow} role="group" aria-label="Días de la semana">
                {PRODUCT_MENU_WEEKDAY_SHORT.map((short, dayIndex) => {
                  const selected = value.weekdays.includes(dayIndex);
                  return (
                    <button
                      key={short}
                      type="button"
                      disabled={disabled}
                      className={
                        selected
                          ? `${styles.weekdayChip} ${styles.weekdayChipActive}`
                          : styles.weekdayChip
                      }
                      aria-pressed={selected}
                      aria-label={WEEKDAY_LABELS[dayIndex]}
                      onClick={() =>
                        onChange({
                          ...value,
                          weekdays: toggleProductMenuWeekday(value.weekdays, dayIndex),
                        })
                      }
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={styles.helpText}>Visible de lunes a domingo.</p>
            )}
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>Horas</span>
              <button
                type="button"
                className={styles.linkBtn}
                disabled={disabled}
                onClick={() => onChange({ ...value, useTimeWindow: !value.useTimeWindow })}
              >
                {value.useTimeWindow ? 'Todo el día' : 'Limitar horas'}
              </button>
            </div>
            {value.useTimeWindow ? (
              <div className={styles.timeRow}>
                <label className={styles.timeField}>
                  <span className={styles.timeLabel}>Desde</span>
                  <input
                    className={styles.input}
                    type="time"
                    disabled={disabled}
                    value={value.dailyStartTime}
                    onChange={(e) => onChange({ ...value, dailyStartTime: e.target.value })}
                  />
                </label>
                <span className={styles.timeDash} aria-hidden>
                  –
                </span>
                <label className={styles.timeField}>
                  <span className={styles.timeLabel}>Hasta</span>
                  <input
                    className={styles.input}
                    type="time"
                    disabled={disabled}
                    value={value.dailyEndTime}
                    onChange={(e) => onChange({ ...value, dailyEndTime: e.target.value })}
                  />
                </label>
              </div>
            ) : (
              <p className={styles.helpText}>Visible a cualquier hora en los días activos.</p>
            )}
          </div>

          <p className={summary ? styles.preview : `${styles.preview} ${styles.previewMuted}`}>
            {summary ?? 'Marca al menos un día o un horario.'}
          </p>
        </div>
      ) : (
        <p className={styles.idle}>Siempre visible mientras el producto esté en el menú.</p>
      )}
    </section>
  );
}
