'use client';

import { useId, useState } from 'react';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type { DeliveryWeatherMode, DispatchMonitorZoneWeather } from '@/lib/api/types';
import { WEATHER_OPTIONS } from '@/lib/dispatch/weatherMode';
import styles from './MonitorWeatherBar.module.css';

function weatherOption(mode: DeliveryWeatherMode | string) {
  return WEATHER_OPTIONS.find((option) => option.mode === mode) ?? WEATHER_OPTIONS[0];
}

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
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  if (zones.length === 0) return null;

  const uniformMode = zones.every((zone) => zone.weather_mode === zones[0]?.weather_mode)
    ? zones[0]?.weather_mode
    : null;
  const uniformOption = uniformMode ? weatherOption(uniformMode) : null;
  const suspended = zones.some((zone) => zone.weather_mode === 'intense');

  return (
    <section className={styles.bar} aria-label="Clima operativo">
      <div className={styles.header}>
        <p className={styles.title}>
          Clima operativo
          {busy ? <span className={styles.saving}> · Guardando</span> : null}
        </p>
        {expanded ? (
          <p className={styles.lead}>
            {canEdit
              ? 'Toca un clima para aplicarlo en esa zona.'
              : 'Vista del clima actual. Tu rol no puede cambiarlo.'}
          </p>
        ) : uniformOption ? (
          <p className={`${styles.badge} ${uniformOption.danger ? styles.badgeDanger : ''}`}>
            <span className={styles.badgeName}>
              {zones.length === 1 ? zones[0].zone_name : `${zones.length} zonas`}
            </span>
            <span className={styles.badgeMode}>{uniformOption.shortLabel}</span>
          </p>
        ) : (
          <ul className={styles.summary}>
            {zones.map((zone) => {
              const option = weatherOption(zone.weather_mode);
              return (
                <li
                  key={zone.zone_id}
                  className={`${styles.badge} ${option.danger ? styles.badgeDanger : ''}`}
                >
                  <span className={styles.badgeName}>{zone.zone_name}</span>
                  <span className={styles.badgeMode}>{option.shortLabel}</span>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
        >
          <span>{expanded ? 'Cerrar' : canEdit ? 'Cambiar' : 'Ver'}</span>
          <ExpandMoreOutlinedIcon
            className={expanded ? styles.chevronOpen : styles.chevron}
            fontSize="small"
            aria-hidden
          />
        </button>
      </div>
      {!expanded && suspended ? (
        <p className={styles.hint}>
          {zones.every((zone) => zone.weather_mode === 'intense')
            ? 'Servicio suspendido'
            : 'Servicio suspendido en al menos una zona'}
        </p>
      ) : null}

      <div id={panelId} className={styles.panel} data-count={zones.length} hidden={!expanded}>
        {zones.map((zone) => {
          const intense = zone.weather_mode === 'intense';
          return (
            <div key={zone.zone_id} className={styles.zone}>
              <p className={styles.zoneName}>{zone.zone_name}</p>
              <div className={styles.buttons} role="group" aria-label={`Clima de ${zone.zone_name}`}>
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
              {intense ? <p className={styles.hint}>Servicio suspendido</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
