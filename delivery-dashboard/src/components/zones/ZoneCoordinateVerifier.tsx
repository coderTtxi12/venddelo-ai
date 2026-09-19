'use client';

import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import LocationSearchingOutlinedIcon from '@mui/icons-material/LocationSearchingOutlined';
import { FormEvent, useState } from 'react';
import {
  isPointInGeoJsonPolygon,
  parseCoordinateInput,
} from '@/lib/geo/pointInPolygon';
import type { GeoJsonPolygon } from '@/lib/onboarding/types';
import styles from './ZoneCoordinateVerifier.module.css';

export type VerificationPoint = {
  lat: number;
  lng: number;
  inside: boolean;
};

type ZoneCoordinateVerifierProps = {
  polygon: GeoJsonPolygon | null;
  onVerify: (point: VerificationPoint) => void;
  onClear: () => void;
  activePoint: VerificationPoint | null;
};

function formatCoord(value: number): string {
  return value.toFixed(15).replace(/\.?0+$/, '');
}

export function ZoneCoordinateVerifier({
  polygon,
  onVerify,
  onClear,
  activePoint,
}: ZoneCoordinateVerifierProps) {
  const [coordinates, setCoordinates] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasPolygon = Boolean(polygon?.coordinates?.[0]?.length);
  const canVerify = hasPolygon;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = parseCoordinateInput(coordinates);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    if (!polygon) {
      setError('Dibuja el cerco en el mapa antes de verificar coordenadas.');
      return;
    }

    const inside = isPointInGeoJsonPolygon(parsed.latitude, parsed.longitude, polygon);
    onVerify({
      lat: parsed.latitude,
      lng: parsed.longitude,
      inside,
    });
  };

  const handleClear = () => {
    setError(null);
    onClear();
  };

  return (
    <section className={styles.panel} aria-labelledby="zone-coordinate-verifier-title">
      <div className={styles.header}>
        <h3 id="zone-coordinate-verifier-title" className={styles.title}>
          Verificar coordenadas
        </h3>
        <p className={styles.hint}>
          Pega o escribe latitud y longitud separadas por coma para comprobar si el punto queda
          dentro o fuera del cerco actual.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <label className={styles.label} htmlFor="zone-verify-coords">
          Coordenadas
          <input
            id="zone-verify-coords"
            className={`${styles.input} ${error ? styles.inputError : ''}`.trim()}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="19.432600, -99.133200"
            value={coordinates}
            disabled={!canVerify}
            onChange={(event) => {
              setCoordinates(event.target.value);
              setError(null);
            }}
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {!hasPolygon ? (
          <p className={styles.hint} role="status">
            Guarda un cerco con al menos 3 puntos para habilitar la verificación.
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.verifyBtn} disabled={!canVerify}>
            <LocationSearchingOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            Verificar en mapa
          </button>
          <button
            type="button"
            className={styles.clearBtn}
            disabled={!activePoint}
            onClick={handleClear}
          >
            Quitar pin
          </button>
        </div>
      </form>

      {activePoint ? (
        <div
          className={`${styles.result} ${activePoint.inside ? styles.resultInside : styles.resultOutside}`}
          role="status"
          aria-live="polite"
        >
          {activePoint.inside ? (
            <CheckCircleOutlineOutlinedIcon className={styles.resultIcon} sx={{ fontSize: 20 }} />
          ) : (
            <HighlightOffOutlinedIcon className={styles.resultIcon} sx={{ fontSize: 20 }} />
          )}
          <div className={styles.resultText}>
            <span className={styles.resultTitle}>
              {activePoint.inside ? 'Dentro del cerco' : 'Fuera del cerco'}
            </span>
            <span className={styles.resultCoords}>
              {formatCoord(activePoint.lat)}, {formatCoord(activePoint.lng)}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
