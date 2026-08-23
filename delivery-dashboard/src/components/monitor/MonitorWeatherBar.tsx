'use client';

import type { DeliveryWeatherMode, DispatchMonitorZoneWeather } from '@/lib/api/types';
import { WEATHER_OPTIONS } from '@/lib/dispatch/weatherMode';
import styles from './MonitorWeatherBar.module.css';

export function MonitorWeatherBar({
  zones,
  canEdit,
  busy = false,
  onChange,
}: {
  zones: DispatchMonitorZoneWeather[];
  canEdit: boolean;
  busy?: boolean;
  onChange: (zoneId: string, mode: DeliveryWeatherMode) => void;
}) {
  if (zones.length === 0) return null;

  return (
    <section className={styles.bar} aria-label="Clima operativo">
      {zones.map((zone) => {
        const intense = zone.weather_mode === 'intense';
        return (
          <div key={zone.zone_id} className={styles.zone}>
            <p className={styles.zoneName}>
              {zones.length > 1 ? zone.zone_name : 'Clima'}
              {busy ? <span className={styles.saving}> · Guardando</span> : null}
            </p>
            <div
              className={styles.buttons}
              role="group"
              aria-label={`Clima de ${zone.zone_name}`}
            >
              {WEATHER_OPTIONS.map((option) => {
                const active = zone.weather_mode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    className={`${styles.button} ${active ? styles.buttonActive : ''} ${
                      option.danger ? styles.buttonDanger : ''
                    }`}
                    disabled={busy || !canEdit}
                    aria-pressed={active}
                    title={option.label}
                    onClick={() => {
                      if (active || busy || !canEdit) return;
                      onChange(zone.zone_id, option.mode);
                    }}
                  >
                    {option.shortLabel}
                  </button>
                );
              })}
            </div>
            {intense ? (
              <p className={styles.hint}>Servicio suspendido</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
