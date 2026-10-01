'use client';

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

export function ProductMenuScheduleEditor({
  value,
  onChange,
  disabled = false,
}: ProductMenuScheduleEditorProps) {
  const summary = value.enabled
    ? formatProductMenuScheduleSummary(productMenuScheduleToApi(value))
    : null;

  return (
    <section className={styles.card} aria-labelledby="product-menu-schedule-title">
      <div>
        <h3 id="product-menu-schedule-title" className={styles.title}>
          Horario en el menú
        </h3>
        <p className={styles.hint}>
          Opcional. Si no lo configuras, el producto sigue las reglas de estado (En menú / Draft /
          Inactivo) sin límite de día u hora.
        </p>
      </div>

      <label className={styles.toggleRow}>
        <span className={styles.toggleCopy}>
          <span className={styles.toggleLabel}>Visibilidad programada</span>
          <span className={styles.toggleHint}>
            Actívalo para mostrar este producto solo en ciertos días u horarios.
          </span>
        </span>
        <input
          className={styles.toggleInput}
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            onChange(
              enabled
                ? { ...value, enabled: true }
                : { ...DEFAULT_PRODUCT_MENU_SCHEDULE_DRAFT },
            );
          }}
        />
      </label>

      {value.enabled ? (
        <>
          <label className={styles.toggleRow}>
            <span className={styles.toggleCopy}>
              <span className={styles.toggleLabel}>Solo ciertos días</span>
              <span className={styles.toggleHint}>
                Desactivado = todos los días. Activado = solo los días que marques.
              </span>
            </span>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={value.useWeekdays}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  useWeekdays: e.target.checked,
                  weekdays: e.target.checked ? value.weekdays : [],
                })
              }
            />
          </label>

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
                    title={WEEKDAY_LABELS[dayIndex]}
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
            <p className={styles.helpText}>Visible todos los días (dentro del horario que definas).</p>
          )}

          <label className={styles.toggleRow}>
            <span className={styles.toggleCopy}>
              <span className={styles.toggleLabel}>Limitar horario del día</span>
              <span className={styles.toggleHint}>
                Desactivado = todo el día. Activado = solo entre las horas indicadas.
              </span>
            </span>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={value.useTimeWindow}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...value, useTimeWindow: e.target.checked })
              }
            />
          </label>

          {value.useTimeWindow ? (
            <div className={styles.grid2}>
              <div>
                <label className={styles.label} htmlFor="product-schedule-start">
                  Desde
                </label>
                <input
                  id="product-schedule-start"
                  className={styles.input}
                  type="time"
                  disabled={disabled}
                  value={value.dailyStartTime}
                  onChange={(e) =>
                    onChange({ ...value, dailyStartTime: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="product-schedule-end">
                  Hasta
                </label>
                <input
                  id="product-schedule-end"
                  className={styles.input}
                  type="time"
                  disabled={disabled}
                  value={value.dailyEndTime}
                  onChange={(e) =>
                    onChange({ ...value, dailyEndTime: e.target.value })
                  }
                />
              </div>
            </div>
          ) : (
            <p className={styles.helpText}>Sin horario: visible todo el día en los días activos.</p>
          )}

          <p className={summary ? styles.preview : `${styles.preview} ${styles.previewMuted}`}>
            {summary ? `En el menú público: ${summary}` : 'Configura al menos días u horario.'}
          </p>
        </>
      ) : null}
    </section>
  );
}
