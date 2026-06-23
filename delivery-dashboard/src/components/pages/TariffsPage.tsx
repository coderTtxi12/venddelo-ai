'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useAuth } from '@/hooks/useAuth';
import {
  getMyDeliveryProviderPricing,
  simulateMyDeliveryProviderPricing,
  updateMyDeliveryProviderPricing,
  updateMyDeliveryProviderWeatherMode,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type {
  DeliveryPricingQuote,
  DeliveryProviderPricingConfig,
  DeliveryWeatherMode,
  OutsideTariffBracket,
} from '@/lib/api/types';
import {
  centsToPesosInput,
  createDefaultPricingConfig,
  createNextBracket,
  formatMoney,
  maxBracketKm,
  parseKmInput,
  pesosInputToCents,
  validateBracketsClient,
} from '@/lib/pricing/tariffUtils';
import styles from './TariffsPage.module.css';

const WEATHER_OPTIONS: { mode: DeliveryWeatherMode; label: string; danger?: boolean }[] = [
  { mode: 'none', label: 'Sin lluvia' },
  { mode: 'light', label: 'Lluvia ligera' },
  { mode: 'heavy', label: 'Lluvia fuerte' },
  { mode: 'intense', label: 'Lluvia intensa (suspendido)', danger: true },
];

type BracketField = keyof Pick<
  OutsideTariffBracket,
  | 'min_km'
  | 'max_km'
  | 'repa_cents'
  | 'mexy_cents'
  | 'restaurant_cents'
  | 'rain_light_cents'
  | 'rain_heavy_cents'
>;

export default function TariffsPage() {
  const { accessToken } = useAuth();
  const [config, setConfig] = useState<DeliveryProviderPricingConfig>(() =>
    createDefaultPricingConfig(),
  );
  const [initialConfig, setInitialConfig] = useState<DeliveryProviderPricingConfig>(() =>
    createDefaultPricingConfig(),
  );
  const [weatherMode, setWeatherMode] = useState<DeliveryWeatherMode>('none');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weatherSaving, setWeatherSaving] = useState(false);
  const [weatherSuccess, setWeatherSuccess] = useState<string | null>(null);
  const weatherSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [simInside, setSimInside] = useState(true);
  const [simDistance, setSimDistance] = useState('5');
  const [simNight, setSimNight] = useState(false);
  const [simWeather, setSimWeather] = useState<DeliveryWeatherMode | 'operational'>('operational');
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [quote, setQuote] = useState<DeliveryPricingQuote | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(initialConfig),
    [config, initialConfig],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) return;
      setLoading(true);
      setError(null);

      try {
        const response = await getMyDeliveryProviderPricing(accessToken);
        if (cancelled) return;
        setConfig(response.config);
        setInitialConfig(response.config);
        setWeatherMode(response.weather_mode);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('No se pudieron cargar las tarifas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    return () => {
      if (weatherSuccessTimerRef.current) {
        clearTimeout(weatherSuccessTimerRef.current);
      }
    };
  }, []);

  const showWeatherSuccess = (message: string) => {
    if (weatherSuccessTimerRef.current) {
      clearTimeout(weatherSuccessTimerRef.current);
    }
    setWeatherSuccess(message);
    weatherSuccessTimerRef.current = setTimeout(() => {
      setWeatherSuccess(null);
      weatherSuccessTimerRef.current = null;
    }, 4000);
  };

  const patchInside = (field: 'day_cents' | 'night_cents', pesos: string) => {
    setConfig((prev) => ({
      ...prev,
      inside_polygon: {
        ...prev.inside_polygon,
        [field]: pesosInputToCents(pesos),
      },
    }));
    setSuccess(null);
  };

  const patchBracket = (index: number, field: BracketField, rawValue: string) => {
    setConfig((prev) => {
      const brackets = prev.outside_polygon.brackets.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (field === 'min_km' || field === 'max_km') {
          return { ...row, [field]: parseKmInput(rawValue) };
        }
        return { ...row, [field]: pesosInputToCents(rawValue) };
      });

      const nextMax = Math.max(prev.outside_polygon.max_distance_km, maxBracketKm(brackets));

      return {
        ...prev,
        outside_polygon: {
          ...prev.outside_polygon,
          max_distance_km: nextMax,
          brackets,
        },
      };
    });
    setSuccess(null);
  };

  const addBracketRow = () => {
    setConfig((prev) => {
      const nextRow = createNextBracket(prev.outside_polygon.brackets);
      const brackets = [...prev.outside_polygon.brackets, nextRow];
      return {
        ...prev,
        outside_polygon: {
          ...prev.outside_polygon,
          max_distance_km: Math.max(prev.outside_polygon.max_distance_km, nextRow.max_km),
          brackets,
        },
      };
    });
    setSuccess(null);
  };

  const removeBracketRow = (index: number) => {
    setConfig((prev) => {
      if (prev.outside_polygon.brackets.length <= 1) return prev;
      const brackets = prev.outside_polygon.brackets.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...prev,
        outside_polygon: {
          ...prev.outside_polygon,
          max_distance_km: Math.max(prev.outside_polygon.max_distance_km, maxBracketKm(brackets)),
          brackets,
        },
      };
    });
    setSuccess(null);
  };

  const patchMaxDistance = (value: string) => {
    const maxDistanceKm = parseKmInput(value);
    setConfig((prev) => ({
      ...prev,
      outside_polygon: {
        ...prev.outside_polygon,
        max_distance_km: maxDistanceKm,
      },
    }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!accessToken || !isDirty) return;

    const bracketError = validateBracketsClient(
      config.outside_polygon.brackets,
      config.outside_polygon.max_distance_km,
    );
    if (bracketError) {
      setError(bracketError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const saved = await updateMyDeliveryProviderPricing(accessToken, { config });
      setConfig(saved.config);
      setInitialConfig(saved.config);
      setWeatherMode(saved.weather_mode);
      setSuccess('Tarifas guardadas correctamente.');
    } catch (err) {
      console.error(err);
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las tarifas.');
    } finally {
      setSaving(false);
    }
  };

  const handleWeatherChange = async (mode: DeliveryWeatherMode) => {
    if (!accessToken || weatherSaving || mode === weatherMode) return;

    setWeatherSaving(true);
    setError(null);
    setSuccess(null);
    setWeatherSuccess(null);

    try {
      const saved = await updateMyDeliveryProviderWeatherMode(accessToken, { weather_mode: mode });
      setWeatherMode(saved.weather_mode);
      setConfig(saved.config);
      setInitialConfig(saved.config);
      const label = WEATHER_OPTIONS.find((option) => option.mode === saved.weather_mode)?.label;
      showWeatherSuccess(
        label
          ? `Clima operativo actualizado: ${label}.`
          : 'Clima operativo actualizado exitosamente.',
      );
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ApiError ? err.message : 'No se pudo actualizar el clima operativo.',
      );
    } finally {
      setWeatherSaving(false);
    }
  };

  const selectSimInside = (inside: boolean) => {
    setSimInside(inside);
    if (!inside) {
      setSimNight(false);
    }
    setQuote(null);
    setSimError(null);
  };

  const handleSimulate = useCallback(async () => {
    if (!accessToken) {
      setSimError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    if (!simInside) {
      const distance = Number.parseFloat(simDistance.replace(',', '.'));
      const maxKm = config.outside_polygon.max_distance_km;
      if (!Number.isFinite(distance) || distance < 0 || distance > maxKm) {
        setSimError(`Ingresa una distancia válida entre 0 y ${maxKm} km.`);
        setQuote(null);
        return;
      }
    }

    setSimulating(true);
    setSimError(null);

    try {
      const distance = Number.parseFloat(simDistance.replace(',', '.'));
      const result = await simulateMyDeliveryProviderPricing(accessToken, {
        inside_polygon: simInside,
        distance_km: simInside ? null : distance,
        is_night: simInside ? simNight : false,
        weather_mode: simWeather === 'operational' ? null : simWeather,
      });
      setQuote(result);
    } catch (err) {
      console.error(err);
      setQuote(null);
      setSimError(
        err instanceof ApiError ? err.message : 'No se pudo calcular la cotización.',
      );
    } finally {
      setSimulating(false);
    }
  }, [accessToken, config.outside_polygon.max_distance_km, simDistance, simInside, simNight, simWeather]);

  return (
    <PanelPageShell
      title="Tarifas de reparto"
      subtitle="Configura precios dentro y fuera de tu polígono de cobertura. Fuera del polígono se usa distancia de ruta (Google Distance Matrix, máx. 20 km restaurante → cliente)."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
      }}
      action={
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={loading || saving || !isDirty}
          onClick={() => void handleSave()}
        >
          {saving ? 'Guardando…' : 'Guardar tarifas'}
        </button>
      }
    >
      {loading ? (
        <p className={styles.loading} role="status">
          Cargando tarifas…
        </p>
      ) : (
        <>
          {error ? (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className={styles.successBanner} role="status">
              {success}
            </div>
          ) : null}

          <section className={styles.panel} aria-labelledby="weather-mode-title">
            <h2 id="weather-mode-title" className={styles.panelTitle}>
              Clima operativo
            </h2>
            <p className={styles.panelHint}>
              Activa lluvia ligera o fuerte para aplicar tarifas de lluvia fuera de cobertura. Lluvia
              intensa suspende entregas.
            </p>
            <div className={styles.weatherRow}>
              {WEATHER_OPTIONS.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  className={`${styles.weatherBtn} ${
                    weatherMode === option.mode ? styles.weatherBtnActive : ''
                  } ${option.danger ? styles.weatherBtnDanger : ''}`}
                  disabled={weatherSaving}
                  aria-pressed={weatherMode === option.mode}
                  onClick={() => void handleWeatherChange(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {weatherSuccess ? (
              <div className={styles.weatherSuccessBanner} role="status" aria-live="polite">
                <CheckCircleOutlineOutlinedIcon className={styles.weatherSuccessIcon} aria-hidden />
                <span>{weatherSuccess}</span>
              </div>
            ) : null}

            {weatherSaving ? (
              <p className={styles.weatherSavingHint} role="status">
                Guardando clima operativo…
              </p>
            ) : null}
          </section>

          <section className={styles.panel} aria-labelledby="inside-tariffs-title">
            <h2 id="inside-tariffs-title" className={styles.panelTitle}>
              Dentro de cobertura (polígono)
            </h2>
            <p className={styles.panelHint}>
              Tarifa fija para clientes dentro de tu zona. Mismo precio con cualquier clima. El
              turno nocturno aplica solo aquí.
            </p>
            <div className={styles.grid2}>
              <label className={styles.label}>
                Día
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={centsToPesosInput(config.inside_polygon.day_cents)}
                  onChange={(e) => patchInside('day_cents', e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Noche
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={centsToPesosInput(config.inside_polygon.night_cents)}
                  onChange={(e) => patchInside('night_cents', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="outside-tariffs-title">
            <div className={styles.panelHeaderRow}>
              <div>
                <h2 id="outside-tariffs-title" className={styles.panelTitle}>
                  Fuera de cobertura
                </h2>
                <p className={styles.panelHint}>
                  Define tramos de distancia de ruta y sus tarifas. REPA = repartidor, MEXY =
                  comisión plataforma, Restaurante = total cobrado.
                </p>
              </div>
              <button type="button" className={styles.addRowBtn} onClick={addBracketRow}>
                <AddOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                Agregar tramo
              </button>
            </div>

            <label className={styles.maxDistanceLabel}>
              Distancia máxima de entrega (km)
              <input
                className={styles.maxDistanceInput}
                type="number"
                min="0.1"
                step="0.1"
                value={config.outside_polygon.max_distance_km}
                onChange={(e) => patchMaxDistance(e.target.value)}
              />
            </label>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>KM desde</th>
                    <th>KM hasta</th>
                    <th>Repa</th>
                    <th>Mexy</th>
                    <th>Restaurante</th>
                    <th>Lluvia ligera</th>
                    <th>Lluvia fuerte</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {config.outside_polygon.brackets.map((row, index) => (
                    <tr key={`bracket-${index}`}>
                      <td>
                        <input
                          className={styles.kmInput}
                          type="number"
                          min="0"
                          step="0.1"
                          value={row.min_km}
                          onChange={(e) => patchBracket(index, 'min_km', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.kmInput}
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={row.max_km}
                          onChange={(e) => patchBracket(index, 'max_km', e.target.value)}
                        />
                      </td>
                      {(
                        [
                          'repa_cents',
                          'mexy_cents',
                          'restaurant_cents',
                          'rain_light_cents',
                          'rain_heavy_cents',
                        ] as const
                      ).map((field) => (
                        <td key={field}>
                          <input
                            className={styles.cellInput}
                            type="number"
                            min="0"
                            step="0.01"
                            value={centsToPesosInput(row[field])}
                            onChange={(e) => patchBracket(index, field, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          className={styles.removeRowBtn}
                          disabled={config.outside_polygon.brackets.length <= 1}
                          aria-label={`Eliminar tramo ${index + 1}`}
                          onClick={() => removeBracketRow(index)}
                        >
                          <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="simulator-title">
            <h2 id="simulator-title" className={styles.panelTitle}>
              Simulador de cotización
            </h2>
            <p className={styles.panelHint}>
              Calcula lo que se cobraría con tus tarifas actuales guardadas (usa clima operativo si
              no eliges uno distinto).
            </p>

            <div className={styles.simGrid}>
              <div>
                <span className={styles.label}>Ubicación del cliente</span>
                <div className={styles.toggleGroup}>
                  <button
                    type="button"
                    className={`${styles.toggleChip} ${simInside ? styles.toggleChipActive : ''}`}
                    onClick={() => setSimInside(true)}
                  >
                    Dentro de cobertura
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleChip} ${!simInside ? styles.toggleChipActive : ''}`}
                    onClick={() => setSimInside(false)}
                  >
                    Fuera de cobertura
                  </button>
                </div>
              </div>

              {!simInside ? (
                <label className={styles.label}>
                  Distancia de ruta (km)
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    max={config.outside_polygon.max_distance_km}
                    step="0.1"
                    value={simDistance}
                    onChange={(e) => setSimDistance(e.target.value)}
                  />
                </label>
              ) : (
                <div>
                  <span className={styles.label}>Turno</span>
                  <div className={styles.toggleGroup}>
                    <button
                      type="button"
                      className={`${styles.toggleChip} ${!simNight ? styles.toggleChipActive : ''}`}
                      onClick={() => setSimNight(false)}
                    >
                      Día
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggleChip} ${simNight ? styles.toggleChipActive : ''}`}
                      onClick={() => setSimNight(true)}
                    >
                      Noche
                    </button>
                  </div>
                </div>
              )}

              <label className={styles.label}>
                Clima para simulación
                <select
                  className={styles.input}
                  value={simWeather}
                  onChange={(e) =>
                    setSimWeather(e.target.value as DeliveryWeatherMode | 'operational')
                  }
                >
                  <option value="operational">Usar clima operativo ({weatherMode})</option>
                  <option value="none">Sin lluvia</option>
                  <option value="light">Lluvia ligera</option>
                  <option value="heavy">Lluvia fuerte</option>
                  <option value="intense">Lluvia intensa</option>
                </select>
              </label>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={simulating}
                  onClick={() => void handleSimulate()}
                >
                  {simulating ? 'Calculando…' : 'Calcular cotización'}
                </button>
              </div>
            </div>

            {simError ? (
              <div className={styles.errorBanner} role="alert">
                {simError}
              </div>
            ) : null}

            {quote ? (
              <div
                className={`${styles.quoteCard} ${quote.available ? '' : styles.quoteUnavailable}`}
                role="status"
              >
                {quote.available ? (
                  <>
                    <div className={styles.quoteTotal}>{formatMoney(quote.total_cents)}</div>
                    <p className={styles.quoteMeta}>
                      {quote.inside_polygon
                        ? `Dentro de cobertura · ${quote.is_night ? 'Noche' : 'Día'}`
                        : `Fuera de cobertura · ${quote.distance_km?.toFixed(1)} km de ruta`}
                    </p>
                    {!quote.inside_polygon ? (
                      <div className={styles.quoteBreakdown}>
                        <div className={styles.quoteRow}>
                          <span>Repa</span>
                          <strong>{formatMoney(quote.repa_cents)}</strong>
                        </div>
                        <div className={styles.quoteRow}>
                          <span>Mexy</span>
                          <strong>{formatMoney(quote.mexy_cents)}</strong>
                        </div>
                        <div className={styles.quoteRow}>
                          <span>Total restaurante</span>
                          <strong>{formatMoney(quote.restaurant_cents)}</strong>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.quoteMeta}>{quote.reason ?? 'Cotización no disponible'}</p>
                )}
              </div>
            ) : null}
          </section>
        </>
      )}
    </PanelPageShell>
  );
}
