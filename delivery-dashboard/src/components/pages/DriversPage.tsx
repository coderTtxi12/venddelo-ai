'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  createMyDeliveryDriver,
  listMyDeliveryDrivers,
  patchMyDeliveryDriver,
  uploadMyDeliveryDriverDocuments,
} from '@/lib/api/deliveryProviders';
import type {
  DeliveryDriver,
  DeliveryDriverCompartmentSize,
  DeliveryDriverStatus,
} from '@/lib/api/types';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { centsToPesosInput, formatMoney, pesosInputToCents } from '@/lib/pricing/tariffUtils';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import panelStyles from './PartnershipsPage.module.css';
import styles from './DriversPage.module.css';

type DocumentField =
  | 'profile_photo'
  | 'ine_document'
  | 'license_document'
  | 'insurance_document';

type DriverFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  compartment_size: DeliveryDriverCompartmentSize;
  plate: string;
  motorcycle_brand: string;
  motorcycle_color: string;
  credit_limit_pesos: string;
  status: DeliveryDriverStatus;
  profile_photo_base64: string;
  profile_photo_file_name: string | null;
  ine_document_base64: string;
  ine_document_file_name: string | null;
  license_document_base64: string;
  license_document_file_name: string | null;
  insurance_document_base64: string;
  insurance_document_file_name: string | null;
};

function createEmptyForm(): DriverFormState {
  return {
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    compartment_size: 'normal',
    plate: '',
    motorcycle_brand: '',
    motorcycle_color: '',
    credit_limit_pesos: '500',
    status: 'invited',
    profile_photo_base64: '',
    profile_photo_file_name: null,
    ine_document_base64: '',
    ine_document_file_name: null,
    license_document_base64: '',
    license_document_file_name: null,
    insurance_document_base64: '',
    insurance_document_file_name: null,
  };
}

function driverToForm(driver: DeliveryDriver): DriverFormState {
  return {
    first_name: driver.first_name,
    last_name: driver.last_name,
    phone: driver.phone,
    email: driver.email,
    compartment_size: driver.compartment_size,
    plate: driver.plate,
    motorcycle_brand: driver.motorcycle_brand,
    motorcycle_color: driver.motorcycle_color,
    credit_limit_pesos: centsToPesosInput(driver.credit_limit_cents),
    status: driver.status,
    profile_photo_base64: '',
    profile_photo_file_name: null,
    ine_document_base64: '',
    ine_document_file_name: null,
    license_document_base64: '',
    license_document_file_name: null,
    insurance_document_base64: '',
    insurance_document_file_name: null,
  };
}

function resolveCreditLimitCents(pesosInput: string): number {
  return pesosInput.trim() === '' ? 50000 : pesosInputToCents(pesosInput);
}

async function fileToDataUrl(file: File): Promise<{ dataUrl: string; fileName: string }> {
  const uploadFile = file.type.startsWith('image/') ? await prepareImageForUpload(file) : file;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(uploadFile);
  });
  return { dataUrl, fileName: uploadFile.name };
}

function statusChipClass(status: DeliveryDriver['status']): string {
  if (status === 'active') return `${styles.chip} ${styles.chipActive}`;
  if (status === 'blocked') return `${styles.chip} ${styles.chipBlocked}`;
  return `${styles.chip} ${styles.chipInvited}`;
}

function statusLabel(status: DeliveryDriver['status']): string {
  if (status === 'active') return 'Activo';
  if (status === 'blocked') return 'Bloqueado';
  return 'Invitado';
}

function compartmentLabel(size: DeliveryDriver['compartment_size']): string {
  return size === 'grande' ? 'Grande' : 'Normal';
}

function DriverAvatar({ driver }: { driver: DeliveryDriver }) {
  const photoUrl = storagePublicUrl(driver.profile_photo_path);
  const initials = `${driver.first_name.charAt(0)}${driver.last_name.charAt(0)}`.toUpperCase();

  if (photoUrl) {
    return <img src={photoUrl} alt="" className={styles.photo} />;
  }

  return <span className={styles.photoFallback}>{initials}</span>;
}

export default function DriversPage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig } = useDeliveryProviderAccess();
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [form, setForm] = useState<DriverFormState>(() => createEmptyForm());
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listMyDeliveryDrivers(accessToken);
      setDrivers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los repartidores');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  const sortedDrivers = useMemo(
    () =>
      [...drivers].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'es'),
      ),
    [drivers],
  );

  async function handleFileChange(field: DocumentField, file: File | null) {
    if (!file) return;
    try {
      const { dataUrl, fileName } = await fileToDataUrl(file);
      setForm((prev) => ({
        ...prev,
        [`${field}_base64`]: dataUrl,
        [`${field}_file_name`]: fileName,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWriteProviderConfig) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingDriverId) {
        const updated = await patchMyDeliveryDriver(accessToken, editingDriverId, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          compartment_size: form.compartment_size,
          plate: form.plate.trim(),
          motorcycle_brand: form.motorcycle_brand.trim(),
          motorcycle_color: form.motorcycle_color.trim(),
          credit_limit_cents: resolveCreditLimitCents(form.credit_limit_pesos),
          status: form.status,
        });

        const hasDocumentUpdates =
          form.profile_photo_base64 ||
          form.ine_document_base64 ||
          form.license_document_base64 ||
          form.insurance_document_base64;

        const saved = hasDocumentUpdates
          ? await uploadMyDeliveryDriverDocuments(accessToken, editingDriverId, {
              profile_photo_base64: form.profile_photo_base64 || undefined,
              profile_photo_file_name: form.profile_photo_file_name,
              ine_document_base64: form.ine_document_base64 || undefined,
              ine_document_file_name: form.ine_document_file_name,
              license_document_base64: form.license_document_base64 || undefined,
              license_document_file_name: form.license_document_file_name,
              insurance_document_base64: form.insurance_document_base64 || undefined,
              insurance_document_file_name: form.insurance_document_file_name,
            })
          : updated;

        setDrivers((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
        setEditingDriverId(null);
        setForm(createEmptyForm());
        setSuccess('Cambios guardados.');
        return;
      }

      const created = await createMyDeliveryDriver(accessToken, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        compartment_size: form.compartment_size,
        plate: form.plate.trim(),
        motorcycle_brand: form.motorcycle_brand.trim(),
        motorcycle_color: form.motorcycle_color.trim(),
        credit_limit_cents: resolveCreditLimitCents(form.credit_limit_pesos),
        profile_photo_base64: form.profile_photo_base64,
        profile_photo_file_name: form.profile_photo_file_name,
        ine_document_base64: form.ine_document_base64,
        ine_document_file_name: form.ine_document_file_name,
        license_document_base64: form.license_document_base64,
        license_document_file_name: form.license_document_file_name,
        insurance_document_base64: form.insurance_document_base64,
        insurance_document_file_name: form.insurance_document_file_name,
      });
      setDrivers((prev) => [created, ...prev]);
      setForm(createEmptyForm());
      setSuccess('Repartidor registrado. Debe iniciar sesión con Google usando el mismo correo.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingDriverId
            ? 'No se pudieron guardar los cambios'
            : 'No se pudo dar de alta al repartidor',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditDriver(driver: DeliveryDriver) {
    setEditingDriverId(driver.id);
    setForm(driverToForm(driver));
    setError(null);
    setSuccess(null);
  }

  function handleCancelEdit() {
    setEditingDriverId(null);
    setForm(createEmptyForm());
    setError(null);
    setSuccess(null);
  }

  const isEditing = editingDriverId !== null;

  const formReady =
    form.first_name.trim() &&
    form.last_name.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.plate.trim() &&
    form.motorcycle_brand.trim() &&
    form.motorcycle_color.trim() &&
    (isEditing ||
      (form.profile_photo_base64 &&
        form.ine_document_base64 &&
        form.license_document_base64 &&
        form.insurance_document_base64));

  return (
    <PanelPageShell
      title="Repartidores"
      subtitle="Da de alta a tu equipo de reparto. Cada repartidor inicia sesión con Google usando el correo que registres aquí."
      styles={panelStyles as PanelPageStyles}
    >
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className={styles.loading} role="status">
          {success}
        </div>
      ) : null}

      {canWriteProviderConfig ? (
        <section className={styles.formSection} aria-labelledby="driver-form-title">
          <h2 id="driver-form-title" className={styles.formTitle}>
            {isEditing ? 'Editar repartidor' : 'Dar de alta'}
          </h2>
          <p className={styles.formSubtitle}>
            {isEditing
              ? 'Actualiza la ficha del repartidor. Los documentos son opcionales al editar; sube uno nuevo solo si quieres reemplazarlo.'
              : 'Sube foto y documentos (imagen o PDF, máximo 8 MB cada uno). El crédito en efectivo predeterminado es $500 MXN.'}
          </p>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-first-name">
                  Nombre
                </label>
                <input
                  id="driver-first-name"
                  className={styles.input}
                  value={form.first_name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, first_name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-last-name">
                  Apellidos
                </label>
                <input
                  id="driver-last-name"
                  className={styles.input}
                  value={form.last_name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, last_name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-phone">
                  Teléfono
                </label>
                <input
                  id="driver-phone"
                  className={styles.input}
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-email">
                  Correo (Google)
                </label>
                <input
                  id="driver-email"
                  type="email"
                  className={styles.input}
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-compartment">
                  Compartimento
                </label>
                <select
                  id="driver-compartment"
                  className={styles.select}
                  value={form.compartment_size}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      compartment_size: event.target.value as DeliveryDriverCompartmentSize,
                    }))
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="grande">Grande</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-credit">
                  Límite de crédito (MXN)
                </label>
                <input
                  id="driver-credit"
                  className={styles.input}
                  inputMode="decimal"
                  value={form.credit_limit_pesos}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, credit_limit_pesos: event.target.value }))
                  }
                  required
                />
              </div>
              {isEditing ? (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="driver-status">
                    Estado
                  </label>
                  <select
                    id="driver-status"
                    className={styles.select}
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        status: event.target.value as DeliveryDriverStatus,
                      }))
                    }
                  >
                    <option value="invited">Invitado</option>
                    <option value="active">Activo</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
              ) : null}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-plate">
                  Placa
                </label>
                <input
                  id="driver-plate"
                  className={styles.input}
                  value={form.plate}
                  onChange={(event) => setForm((prev) => ({ ...prev, plate: event.target.value }))}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-brand">
                  Marca de moto
                </label>
                <input
                  id="driver-brand"
                  className={styles.input}
                  value={form.motorcycle_brand}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, motorcycle_brand: event.target.value }))
                  }
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-color">
                  Color
                </label>
                <input
                  id="driver-color"
                  className={styles.input}
                  value={form.motorcycle_color}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, motorcycle_color: event.target.value }))
                  }
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-photo">
                  Foto de perfil
                </label>
                <input
                  id="driver-photo"
                  className={styles.fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void handleFileChange('profile_photo', event.target.files?.[0] ?? null)
                  }
                  required={!isEditing && !form.profile_photo_base64}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-ine">
                  INE
                </label>
                <input
                  id="driver-ine"
                  className={styles.fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) =>
                    void handleFileChange('ine_document', event.target.files?.[0] ?? null)
                  }
                  required={!isEditing && !form.ine_document_base64}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-license">
                  Licencia
                </label>
                <input
                  id="driver-license"
                  className={styles.fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) =>
                    void handleFileChange('license_document', event.target.files?.[0] ?? null)
                  }
                  required={!isEditing && !form.license_document_base64}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="driver-insurance">
                  Seguro
                </label>
                <input
                  id="driver-insurance"
                  className={styles.fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) =>
                    void handleFileChange('insurance_document', event.target.files?.[0] ?? null)
                  }
                  required={!isEditing && !form.insurance_document_base64}
                />
              </div>
            </div>
            <div className={styles.actions}>
              {isEditing ? (
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelEdit}
                  disabled={submitting}
                >
                  Cancelar
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={submitting || !formReady}
              >
                {submitting
                  ? 'Guardando…'
                  : isEditing
                    ? 'Guardar cambios'
                    : 'Dar de alta'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {loading ? (
        <div className={styles.loading}>Cargando repartidores…</div>
      ) : sortedDrivers.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Aún no hay repartidores</p>
          <p className={styles.emptySubtitle}>
            {canWriteProviderConfig
              ? 'Usa el formulario de arriba para registrar al primero.'
              : 'Cuando el administrador registre repartidores, aparecerán aquí.'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {sortedDrivers.map((driver) => {
            const availableCents = driver.credit_limit_cents - driver.credit_held_cents;
            const isSelected = editingDriverId === driver.id;
            return (
              <article
                key={driver.id}
                className={`${styles.card}${isSelected ? ` ${styles.cardSelected}` : ''}`}
              >
                <button
                  type="button"
                  className={styles.cardMainButton}
                  onClick={() => {
                    if (canWriteProviderConfig) handleEditDriver(driver);
                  }}
                  disabled={!canWriteProviderConfig}
                >
                  <DriverAvatar driver={driver} />
                  <div className={styles.main}>
                    <h3 className={styles.name}>
                      {driver.first_name} {driver.last_name}
                    </h3>
                    <p className={styles.meta}>{driver.email}</p>
                    <div className={styles.details}>
                      <span>Crédito disponible: {formatMoney(availableCents)}</span>
                      <span>Compartimento: {compartmentLabel(driver.compartment_size)}</span>
                    </div>
                  </div>
                </button>
                <div className={styles.cardAside}>
                  <div className={styles.chips}>
                    <span className={statusChipClass(driver.status)}>{statusLabel(driver.status)}</span>
                    {driver.is_online ? (
                      <span className={`${styles.chip} ${styles.chipOnline}`}>En línea</span>
                    ) : null}
                  </div>
                  {canWriteProviderConfig ? (
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => handleEditDriver(driver)}
                    >
                      Editar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PanelPageShell>
  );
}
