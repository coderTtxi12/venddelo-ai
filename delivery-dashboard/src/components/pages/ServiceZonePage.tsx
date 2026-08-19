'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { ServiceZoneMapDrawer } from '@/components/onboarding/ServiceZoneMapDrawer';
import { PanelPageShell } from '@/components/pages/PanelPageShell';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import ZoneSwitcher from '@/components/zones/ZoneSwitcher';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyDeliveryProviderZone } from '@/lib/api/deliveryProviders';
import { ApiError } from '@/lib/api/types';
import type { OnboardingData } from '@/lib/onboarding/types';
import { validateServiceZone } from '@/lib/settings/providerProfile';
import {
  buildZoneWritePayload,
  createEmptyZoneForm,
  zoneDeleteBlockedMessage,
  zoneFieldsDirty,
  zoneFormFromApi,
  type ZoneFormState,
} from '@/lib/settings/zoneProfile';
import styles from './SettingsPage.module.css';
import createStyles from './ServiceZonePage.module.css';

export default function ServiceZonePage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig, isOperator } = useDeliveryProviderAccess();
  const {
    zones,
    selectedZone,
    effectiveZoneId,
    createZone,
    updateZone,
    deleteZone,
    refreshZones,
  } = useDeliveryZone();

  const [form, setForm] = useState<ZoneFormState>(() => createEmptyZoneForm());
  const [initialForm, setInitialForm] = useState<ZoneFormState>(() => createEmptyZoneForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ZoneFormState>(() => createEmptyZoneForm());
  const [creating, setCreating] = useState(false);
  const createDialogRef = useRef<HTMLDivElement>(null);

  const isDirty = useMemo(() => zoneFieldsDirty(form, initialForm), [form, initialForm]);
  const restaurantCount = selectedZone?.restaurant_count ?? 0;
  const deleteBlocked = restaurantCount > 0;
  const canDeleteZone = canWriteProviderConfig && zones.length > 1;
  const referenceZones = useMemo(
    () =>
      zones.flatMap((zone) => {
        if (!zone.polygon) return [];
        const ring = zone.polygon.coordinates[0];
        if (!ring || ring.length < 4) return [];
        return [{ id: zone.id, name: zone.name, polygon: zone.polygon }];
      }),
    [zones],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !effectiveZoneId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const zone = await getMyDeliveryProviderZone(accessToken, effectiveZoneId);
        if (cancelled) return;

        const nextForm = zoneFormFromApi(zone);
        setForm(nextForm);
        setInitialForm(nextForm);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudo cargar tu zona de reparto. Intenta de nuevo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, effectiveZoneId]);

  const patchForm = useCallback((patch: Partial<ZoneFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSuccess(null);
    setError(null);
  }, []);

  const handleServiceZonePolygonChange = useCallback(
    (polygon: OnboardingData['serviceZonePolygon']) => {
      patchForm({ serviceZonePolygon: polygon });
    },
    [patchForm],
  );

  const handleSave = async () => {
    if (!accessToken || !effectiveZoneId) {
      setError('Selecciona una zona de reparto.');
      return;
    }

    const validationError = validateServiceZone(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateZone(effectiveZoneId, buildZoneWritePayload(form));
      const nextForm = zoneFormFromApi(updated);
      setForm(nextForm);
      setInitialForm(nextForm);
      setSuccess('Cerco geográfico guardado correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo guardar el cerco geográfico. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async () => {
    if (!effectiveZoneId || deleteBlocked) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteZone(effectiveZoneId);
      setDeleteDialogOpen(false);
      setSuccess('Zona eliminada correctamente.');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo eliminar la zona. Intenta de nuevo.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateZone = async () => {
    const validationError = validateServiceZone(createForm);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!createForm.serviceZoneName.trim()) {
      setError('Ingresa un nombre para la nueva zona.');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createZone(buildZoneWritePayload(createForm));
      setCreateDialogOpen(false);
      setCreateForm(createEmptyZoneForm());
      setSuccess('Zona creada correctamente.');
      await refreshZones();
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo crear la zona. Intenta de nuevo.');
      }
    } finally {
      setCreating(false);
    }
  };

  const openCreateDialog = () => {
    setCreateForm(createEmptyZoneForm());
    setCreateDialogOpen(true);
  };

  useEffect(() => {
    if (!createDialogOpen) return;

    const previousBody = document.body.style.overflow;
    const previousHtml = document.documentElement.style.overflow;
    const locked = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-lock]')).map(
      (node) => ({ node, overflow: node.style.overflow }),
    );

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    locked.forEach(({ node }) => {
      node.style.overflow = 'hidden';
    });

    createDialogRef.current?.querySelector('input')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || creating) return;
      event.preventDefault();
      setCreateDialogOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousHtml;
      locked.forEach(({ node, overflow }) => {
        node.style.overflow = overflow;
      });
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [createDialogOpen, creating]);

  return (
    <>
      <PanelPageShell
        title="Cerco geográfico"
        subtitle="Define el área donde realizas entregas. Ajusta el nombre de la zona y dibuja el polígono en el mapa."
        styles={{
          page: styles.page,
          header: styles.header,
          title: styles.title,
          subtitle: styles.subtitle,
          empty: styles.loading,
        }}
        action={
          canWriteProviderConfig ? (
            <div className={createStyles.headerActions}>
              {canDeleteZone ? (
                <button
                  type="button"
                  className={createStyles.deleteBtn}
                  disabled={loading || deleting || deleteBlocked}
                  title={deleteBlocked ? zoneDeleteBlockedMessage(restaurantCount) : 'Eliminar zona'}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                  Eliminar zona
                </button>
              ) : null}
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={loading || saving || !isDirty || !effectiveZoneId}
                onClick={() => void handleSave()}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          ) : null
        }
      >
        <ZoneSwitcher onAddZone={openCreateDialog} />

        {!effectiveZoneId ? (
          <p className={styles.loading} role="status">
            Selecciona o crea una zona de reparto para continuar.
          </p>
        ) : loading ? (
          <p className={styles.loading} role="status">
            Cargando zona de reparto…
          </p>
        ) : (
          <section className={styles.panel} aria-labelledby="service-zone-panel">
            {isOperator ? (
              <div className={styles.operatorNotice} role="status">
                Tu rol de Operador permite consultar el cerco geográfico, pero no editarlo.
              </div>
            ) : null}
            {deleteBlocked ? (
              <div className={styles.operatorNotice} role="status">
                {zoneDeleteBlockedMessage(restaurantCount)}
              </div>
            ) : null}
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
            <fieldset disabled={!canWriteProviderConfig} className={styles.readOnlyFieldset}>
              <label className={`${styles.label} ${styles.formGridFull}`}>
                Nombre de la zona
                <input
                  className={styles.input}
                  value={form.serviceZoneName}
                  placeholder="Cobertura principal"
                  onChange={(e) => patchForm({ serviceZoneName: e.target.value })}
                />
              </label>
              <div className={styles.mapWrap}>
                <ServiceZoneMapDrawer
                  polygon={form.serviceZonePolygon}
                  searchAddress={form.serviceZoneSearchAddress}
                  centerLat={form.serviceZoneCenterLat}
                  centerLng={form.serviceZoneCenterLng}
                  onSearchPlaceChange={(place) =>
                    patchForm({
                      serviceZoneSearchAddress: place.address,
                      serviceZoneCenterLat: place.latitude,
                      serviceZoneCenterLng: place.longitude,
                    })
                  }
                  onPolygonChange={handleServiceZonePolygonChange}
                />
              </div>
            </fieldset>
          </section>
        )}
      </PanelPageShell>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Eliminar zona"
        body={
          <>
            ¿Seguro que quieres eliminar la zona <strong>{selectedZone?.name}</strong>? Esta acción no
            se puede deshacer.
          </>
        }
        confirmLabel="Eliminar zona"
        confirming={deleting}
        confirmDisabled={deleteBlocked}
        onCancel={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void handleDeleteZone()}
      />

      {createDialogOpen ? (
        <div
          className={createStyles.modalBackdrop}
          data-scroll-root
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creating) setCreateDialogOpen(false);
          }}
        >
          <div
            ref={createDialogRef}
            className={createStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-zone-title"
            tabIndex={-1}
          >
            <div className={createStyles.modalHeader}>
              <h2 id="create-zone-title" className={createStyles.modalTitle}>
                Nueva zona de reparto
              </h2>
              <p className={createStyles.modalHint}>
                Asigna un nombre y dibuja el polígono de cobertura para la nueva zona. Las zonas
                actuales aparecen en azul solo como referencia.
              </p>
              {referenceZones.length > 0 ? (
                <div className={createStyles.legend} aria-label="Leyenda del mapa">
                  <span className={createStyles.legendItem}>
                    <span className={`${createStyles.legendSwatch} ${createStyles.legendSwatchExisting}`} />
                    Zonas actuales (solo consulta)
                  </span>
                  <span className={createStyles.legendItem}>
                    <span className={`${createStyles.legendSwatch} ${createStyles.legendSwatchNew}`} />
                    Nueva zona
                  </span>
                </div>
              ) : null}
            </div>

            <div className={createStyles.modalBody}>
              <label className={styles.label}>
                Nombre de la zona
                <input
                  className={styles.input}
                  value={createForm.serviceZoneName}
                  placeholder="Cobertura norte"
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, serviceZoneName: e.target.value }))
                  }
                />
              </label>

              <div className={createStyles.mapSlot}>
                <ServiceZoneMapDrawer
                  polygon={createForm.serviceZonePolygon}
                  searchAddress={createForm.serviceZoneSearchAddress}
                  centerLat={createForm.serviceZoneCenterLat}
                  centerLng={createForm.serviceZoneCenterLng}
                  referenceZones={referenceZones}
                  embeddedInScrollable
                  onSearchPlaceChange={(place) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      serviceZoneSearchAddress: place.address,
                      serviceZoneCenterLat: place.latitude,
                      serviceZoneCenterLng: place.longitude,
                    }))
                  }
                  onPolygonChange={(polygon) =>
                    setCreateForm((prev) => ({ ...prev, serviceZonePolygon: polygon }))
                  }
                />
              </div>
            </div>

            <div className={createStyles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={creating}
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={creating}
                onClick={() => void handleCreateZone()}
              >
                <AddOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                {creating ? 'Creando…' : 'Crear zona'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
