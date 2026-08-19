'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  getMyDeliveryProviderAssignmentSettings,
  getMyDeliveryProviderSearchLeadTimes,
  patchMyDeliveryProviderAssignmentSettings,
  patchMyDeliveryProviderSearchLeadTimes,
} from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type { DeliveryAssignmentSettingsUpdate, DeliverySearchLeadTime } from '@/lib/api/types';
import styles from './AssignmentPage.module.css';

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  fullWidth = false,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  fullWidth?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`${styles.field} ${fullWidth ? styles.fieldGridFull : ''}`.trim()}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
      <input
        id={id}
        className={styles.input}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionHint}>{hint}</p>
      </div>
      {children}
    </section>
  );
}

export default function AssignmentPage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig, isOperator } = useDeliveryProviderAccess();
  const [assignmentSettings, setAssignmentSettings] =
    useState<DeliveryAssignmentSettingsUpdate | null>(null);
  const [initialAssignmentSettings, setInitialAssignmentSettings] =
    useState<DeliveryAssignmentSettingsUpdate | null>(null);
  const [leadTimes, setLeadTimes] = useState<DeliverySearchLeadTime[]>([]);
  const [initialLeadTimes, setInitialLeadTimes] = useState<DeliverySearchLeadTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDirty =
    assignmentSettings !== null &&
    initialAssignmentSettings !== null &&
    (JSON.stringify(assignmentSettings) !== JSON.stringify(initialAssignmentSettings) ||
      JSON.stringify(leadTimes) !== JSON.stringify(initialLeadTimes));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) return;
      setLoading(true);
      setError(null);

      try {
        const [settings, rows] = await Promise.all([
          getMyDeliveryProviderAssignmentSettings(accessToken),
          getMyDeliveryProviderSearchLeadTimes(accessToken),
        ]);
        if (cancelled) return;
        const { pre_free_speed_mps: _ignored, ...editable } = settings;
        setAssignmentSettings(editable);
        setInitialAssignmentSettings(editable);
        setLeadTimes(rows);
        setInitialLeadTimes(rows);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudo cargar la configuración de asignación.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const patchAssignmentField = <K extends keyof DeliveryAssignmentSettingsUpdate>(
    field: K,
    value: DeliveryAssignmentSettingsUpdate[K],
  ) => {
    setAssignmentSettings((current) => (current ? { ...current, [field]: value } : current));
    setSuccess(null);
    setError(null);
  };

  const patchLeadTime = (prepMinutes: number, searchAheadMinutes: number) => {
    setLeadTimes((current) =>
      current.map((row) =>
        row.prep_minutes === prepMinutes
          ? { ...row, search_ahead_minutes: searchAheadMinutes }
          : row,
      ),
    );
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!accessToken || !assignmentSettings) {
      setError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedSettings = await patchMyDeliveryProviderAssignmentSettings(
        accessToken,
        assignmentSettings,
      );
      const updatedLeadTimes = await patchMyDeliveryProviderSearchLeadTimes(
        accessToken,
        leadTimes,
      );
      const { pre_free_speed_mps: _ignored, ...editable } = updatedSettings;
      setAssignmentSettings(editable);
      setInitialAssignmentSettings(editable);
      setLeadTimes(updatedLeadTimes);
      setInitialLeadTimes(updatedLeadTimes);
      setSuccess('Configuración guardada.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo guardar la configuración de asignación.');
      }
      try {
        const [settings, rows] = await Promise.all([
          getMyDeliveryProviderAssignmentSettings(accessToken),
          getMyDeliveryProviderSearchLeadTimes(accessToken),
        ]);
        const { pre_free_speed_mps: _ignored, ...editable } = settings;
        setAssignmentSettings(editable);
        setInitialAssignmentSettings(editable);
        setLeadTimes(rows);
        setInitialLeadTimes(rows);
      } catch (reloadErr) {
        console.error(reloadErr);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelPageShell
      title="Asignación"
      subtitle="Parámetros del motor que busca y asigna repartidores a los pedidos."
      styles={{
        page: styles.page,
        header: styles.header,
        title: styles.title,
        subtitle: styles.subtitle,
        empty: styles.loading,
      }}
      action={
        canWriteProviderConfig ? (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={loading || saving || !isDirty || !assignmentSettings}
            onClick={() => void handleSave()}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        ) : null
      }
    >
      <p className={styles.scopeBadge}>Por empresa · no por zona</p>

      {loading || !assignmentSettings ? (
        <p className={styles.loading} role="status">
          Cargando asignación…
        </p>
      ) : (
        <>
          <div className={styles.alertStack}>
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
            {isOperator ? (
              <div className={styles.operatorNotice} role="status">
                Tu rol de Operador permite consultar esta configuración, pero no editarla.
              </div>
            ) : null}
          </div>

          <fieldset disabled={!canWriteProviderConfig} className={styles.readOnlyFieldset}>
            <div className={styles.sections}>
              <Section
                title="Anticipo de búsqueda"
                hint="Minutos antes de que el pedido esté listo en los que empieza la búsqueda de repartidor."
              >
                <div className={styles.leadTimeList}>
                  {leadTimes.map((row) => (
                    <div key={row.prep_minutes} className={styles.leadTimeRow}>
                      <span className={styles.leadTimePrep}>
                        {row.prep_minutes}{' '}
                        <span className={styles.leadTimePrepMuted}>min de preparación</span>
                      </span>
                      <input
                        className={`${styles.input} ${styles.inputCompact}`}
                        type="number"
                        min={0}
                        aria-label={`Anticipo de búsqueda para ${row.prep_minutes} minutos de preparación`}
                        value={row.search_ahead_minutes}
                        onChange={(event) =>
                          patchLeadTime(row.prep_minutes, Number(event.target.value))
                        }
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section
                title="Ofertas y tiempos"
                hint="Controla cuánto espera el repartidor y cuándo se reintenta la asignación."
              >
                <div className={styles.fieldGrid}>
                  <NumberField
                    id="offer-timeout"
                    label="Timeout de oferta"
                    hint="Segundos para aceptar la oferta."
                    min={1}
                    value={assignmentSettings.offer_timeout_seconds}
                    onChange={(value) => patchAssignmentField('offer_timeout_seconds', value)}
                  />
                  <NumberField
                    id="pre-free"
                    label="Pre-libre"
                    hint="Segundos antes de liberar al repartidor."
                    min={1}
                    value={assignmentSettings.pre_free_eta_seconds}
                    onChange={(value) => patchAssignmentField('pre_free_eta_seconds', value)}
                  />
                  <NumberField
                    id="gps-stale"
                    label="GPS obsoleto"
                    hint="Máximo de segundos sin ubicación."
                    min={1}
                    value={assignmentSettings.driver_location_staleness_seconds}
                    onChange={(value) =>
                      patchAssignmentField('driver_location_staleness_seconds', value)
                    }
                  />
                  <NumberField
                    id="retry"
                    label="Reintento"
                    hint="Segundos entre intentos de asignación."
                    min={1}
                    value={assignmentSettings.assignment_retry_seconds}
                    onChange={(value) => patchAssignmentField('assignment_retry_seconds', value)}
                  />
                  <NumberField
                    id="assignment-timeout"
                    label="Timeout de asignación"
                    hint="Tiempo máximo antes de marcar como sin asignar."
                    min={1}
                    value={assignmentSettings.assignment_timeout_seconds}
                    onChange={(value) =>
                      patchAssignmentField('assignment_timeout_seconds', value)
                    }
                  />
                  <NumberField
                    id="max-packages"
                    label="Máx. paquetes por repartidor"
                    hint="Tope de paquetes activos a la vez. El motor no le ofrece más si ya llegó al límite."
                    min={1}
                    value={assignmentSettings.max_active_packages_per_driver}
                    onChange={(value) =>
                      patchAssignmentField('max_active_packages_per_driver', value)
                    }
                  />
                </div>
              </Section>

              <Section
                title="Demanda y protección"
                hint="Umbrales para alta demanda y repartidores que no deben recibir ofertas."
              >
                <div className={styles.fieldGrid}>
                  <NumberField
                    id="protected-drivers"
                    label="Repartidores protegidos"
                    hint="Mínimo de repartidores libres a reservar."
                    min={0}
                    value={assignmentSettings.min_protected_drivers}
                    onChange={(value) => patchAssignmentField('min_protected_drivers', value)}
                  />
                  <NumberField
                    id="demand-max-free"
                    label="Alta demanda: máx. libres"
                    hint="Si hay menos libres, entra modo demanda."
                    min={0}
                    value={assignmentSettings.high_demand_available_drivers_max}
                    onChange={(value) =>
                      patchAssignmentField('high_demand_available_drivers_max', value)
                    }
                  />
                  <NumberField
                    id="demand-occupation"
                    label="Alta demanda: ocupación"
                    hint="Ratio de repartidores ocupados (0–1)."
                    min={0}
                    max={1}
                    step={0.01}
                    value={assignmentSettings.high_demand_occupied_ratio}
                    onChange={(value) =>
                      patchAssignmentField('high_demand_occupied_ratio', value)
                    }
                  />
                  <NumberField
                    id="demand-pending"
                    label="Alta demanda: pendientes mín."
                    hint="Pedidos pendientes para activar demanda."
                    min={0}
                    value={assignmentSettings.high_demand_pending_min}
                    onChange={(value) => patchAssignmentField('high_demand_pending_min', value)}
                  />
                </div>
              </Section>

              <Section
                title="Enganche (caso C)"
                hint="En alta demanda, si no hay rider libre y a alguien todavía le falta recoger en ese restaurante, el motor puede sumarle el pedido cuando el último dropoff de lo que aún lleva quede cerca del nuevo, en línea recta."
              >
                <div className={styles.fieldGrid}>
                  <NumberField
                    id="near-dropoff"
                    label="Radio de dropoff cercano"
                    hint="Metros en línea recta entre el último dropoff del rider y el nuevo. Por defecto 800."
                    min={0}
                    value={assignmentSettings.near_destination_radius_meters}
                    onChange={(value) =>
                      patchAssignmentField('near_destination_radius_meters', value)
                    }
                  />
                </div>
              </Section>

              <Section
                title="Desvío (caso D)"
                hint="En alta demanda, si el rider ya salió (recogió o va en camino), el motor puede sumarle un pedido cuando esté a esta distancia en línea recta del restaurante nuevo. No mira el dropoff."
              >
                <div className={styles.fieldGrid}>
                  <NumberField
                    id="d-pickup"
                    label="Radio al restaurante"
                    hint="Metros en línea recta del GPS del rider al restaurante nuevo. Por defecto 1000."
                    min={0}
                    value={assignmentSettings.max_pickup_detour_meters}
                    onChange={(value) =>
                      patchAssignmentField('max_pickup_detour_meters', value)
                    }
                  />
                </div>
              </Section>
            </div>
          </fieldset>
        </>
      )}
    </PanelPageShell>
  );
}
