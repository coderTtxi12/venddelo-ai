'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { DriverAvatar } from '@/components/drivers/DriverAvatar';
import { DriverMetaTags } from '@/components/drivers/DriverMetaTags';
import { DriverPhoneContact } from '@/components/drivers/DriverPhoneContact';
import { FormSelect } from '@/components/ui/FormSelect';
import { PanelPageShell, type PanelPageStyles } from '@/components/pages/PanelPageShell';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { useDeliveryZone } from '@/contexts/DeliveryZoneContext';
import { useAuth } from '@/hooks/useAuth';
import {
  createMyDeliveryDriver,
  getMyDeliveryDriver,
  listMyDeliveryDrivers,
  patchMyDeliveryDriver,
  uploadMyDeliveryDriverDocuments,
} from '@/lib/api/deliveryProviders';
import type { DeliveryDriverUpdateInput, DeliveryProviderZone } from '@/lib/api/types';
import type {
  DeliveryDriver,
  DeliveryDriverCompartmentSize,
  DeliveryDriverStatus,
} from '@/lib/api/types';
import {
  MOTORCYCLE_COLOR_PRESETS,
  motorcycleColorHex,
  motorcycleColorIsCustom,
} from '@/lib/drivers/motorcycleColors';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { DEFAULT_COUNTRY_ISO, findCountryByIso, formatE164 } from '@/lib/phone/countryDialCodes';
import { parseE164Phone } from '@/lib/phone/parseE164';
import { centsToPesosInput, pesosInputToCents } from '@/lib/pricing/tariffUtils';
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
  phoneCountryIso: string;
  phoneLocal: string;
  emergency_contact_name: string;
  emergencyContactPhoneCountryIso: string;
  emergencyContactPhoneLocal: string;
  email: string;
  compartment_size: DeliveryDriverCompartmentSize;
  plate: string;
  motorcycle_brand: string;
  motorcycle_color: string;
  registered_zone_id: string;
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

function createEmptyForm(registeredZoneId = ''): DriverFormState {
  return {
    first_name: '',
    last_name: '',
    phoneCountryIso: DEFAULT_COUNTRY_ISO,
    phoneLocal: '',
    emergency_contact_name: '',
    emergencyContactPhoneCountryIso: DEFAULT_COUNTRY_ISO,
    emergencyContactPhoneLocal: '',
    email: '',
    compartment_size: 'normal',
    plate: '',
    motorcycle_brand: '',
    motorcycle_color: '',
    registered_zone_id: registeredZoneId,
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
  const phone = parseE164Phone(driver.phone);
  const emergencyPhone = parseE164Phone(driver.emergency_contact_phone ?? '');
  return {
    first_name: driver.first_name,
    last_name: driver.last_name,
    phoneCountryIso: phone.countryIso,
    phoneLocal: phone.localNumber,
    emergency_contact_name: driver.emergency_contact_name ?? '',
    emergencyContactPhoneCountryIso: emergencyPhone.countryIso,
    emergencyContactPhoneLocal: emergencyPhone.localNumber,
    email: driver.email,
    compartment_size: driver.compartment_size,
    plate: driver.plate,
    motorcycle_brand: driver.motorcycle_brand,
    motorcycle_color: driver.motorcycle_color,
    registered_zone_id: driver.registered_zone_id ?? '',
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

function phoneFromForm(form: DriverFormState): string {
  return formatE164(findCountryByIso(form.phoneCountryIso).dialCode, form.phoneLocal);
}

function emergencyPhoneFromForm(form: DriverFormState): string {
  return formatE164(
    findCountryByIso(form.emergencyContactPhoneCountryIso).dialCode,
    form.emergencyContactPhoneLocal,
  );
}

function resolveCreateCreditLimitCents(pesosInput: string): number {
  return pesosInput.trim() === '' ? 50000 : pesosInputToCents(pesosInput);
}

function applyEditCreditLimitCents(
  body: DeliveryDriverUpdateInput,
  pesosInput: string,
): DeliveryDriverUpdateInput {
  const trimmed = pesosInput.trim();
  if (trimmed === '') {
    return body;
  }
  return { ...body, credit_limit_cents: pesosInputToCents(trimmed) };
}

function isDriverFormReady(
  form: DriverFormState,
  mode: 'create' | 'edit',
  zonesLength: number,
): boolean {
  return Boolean(
    form.first_name.trim() &&
      form.last_name.trim() &&
      form.phoneLocal.trim() &&
      form.emergency_contact_name.trim() &&
      form.emergencyContactPhoneLocal.trim() &&
      form.email.trim() &&
      form.plate.trim() &&
      form.motorcycle_brand.trim() &&
      form.motorcycle_color.trim() &&
      (zonesLength === 0 || form.registered_zone_id) &&
      (mode === 'edit' ||
        (form.profile_photo_base64 &&
          form.ine_document_base64 &&
          form.license_document_base64 &&
          form.insurance_document_base64)),
  );
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

function createFormSummary(form: DriverFormState): string {
  const name = [form.first_name, form.last_name].filter(Boolean).join(' ').trim();
  if (name) return `Borrador: ${name}`;
  return 'Foto, documentos y datos del repartidor';
}

function storedDocumentFileName(path: string | null | undefined): string | null {
  if (!path) return null;
  const segment = path.split('/').pop();
  return segment || null;
}

function isImageStoragePath(path: string): boolean {
  return /\.(webp|png|jpe?g|gif)$/i.test(path);
}

function isPdfStoragePath(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}

function resolveDocumentPreviewUrl(
  newBase64: string,
  storedPath: string | null | undefined,
): string | null {
  if (newBase64.startsWith('data:image')) return newBase64;
  if (!storedPath || !isImageStoragePath(storedPath)) return null;
  return storagePublicUrl(storedPath);
}

function DocumentUploadField({
  id,
  label,
  accept,
  fileName,
  newBase64,
  storedPath,
  hint,
  onFile,
}: {
  id: string;
  label: string;
  accept: string;
  fileName: string | null;
  newBase64: string;
  storedPath?: string | null;
  hint: string;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = resolveDocumentPreviewUrl(newBase64, storedPath);
  const storedName = storedDocumentFileName(storedPath);
  const showPdfBadge = !previewUrl && Boolean(storedPath && isPdfStoragePath(storedPath));
  const hasFile = Boolean(fileName || previewUrl || storedPath);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.uploadRow}>
        {previewUrl ? (
          <img src={previewUrl} alt="" className={styles.uploadPreview} />
        ) : showPdfBadge ? (
          <span className={styles.uploadPdfBadge} aria-hidden>
            PDF
          </span>
        ) : (
          <span className={styles.uploadPlaceholder} aria-hidden />
        )}
        <button
          type="button"
          className={styles.uploadButton}
          onClick={() => inputRef.current?.click()}
        >
          <CloudUploadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
          {hasFile ? 'Cambiar archivo' : 'Subir archivo'}
        </button>
        <input
          ref={inputRef}
          id={id}
          className={styles.hiddenInput}
          type="file"
          accept={accept}
          onChange={(event) => {
            onFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </div>
      <p className={styles.fileHint}>{fileName ?? storedName ?? hint}</p>
    </div>
  );
}

function MotorcycleColorField({
  value,
  onChange,
  idPrefix,
}: {
  value: string;
  onChange: (next: string) => void;
  idPrefix: string;
}) {
  const customSelected = motorcycleColorIsCustom(value);
  const customHex = motorcycleColorHex(value);

  return (
    <div className={`${styles.field} ${styles.fieldFull}`}>
      <span className={styles.label} id={`${idPrefix}-color-label`}>
        Color
      </span>
      <div className={styles.colorGrid} role="listbox" aria-labelledby={`${idPrefix}-color-label`}>
        {MOTORCYCLE_COLOR_PRESETS.map((option) => {
          const selected = !customSelected && option.label === value;
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`${styles.colorSwatch} ${selected ? styles.colorSwatchSelected : ''}`}
              onClick={() => onChange(option.label)}
            >
              <span
                className={styles.colorDot}
                style={{ background: option.hex }}
                aria-hidden
              />
              <span>{option.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="option"
          aria-selected={customSelected}
          className={`${styles.colorSwatch} ${styles.colorSwatchPlain} ${customSelected ? styles.colorSwatchSelected : ''}`}
          onClick={() => onChange(customHex)}
        >
          Otro
        </button>
      </div>
      {customSelected ? (
        <div className={styles.customColorRow}>
          <label className={styles.customColorLabel} htmlFor={`${idPrefix}-color-picker`}>
            Color personalizado
          </label>
          <input
            id={`${idPrefix}-color-picker`}
            className={styles.colorPicker}
            type="color"
            value={customHex}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
          <span className={styles.customColorValue}>{customHex}</span>
        </div>
      ) : null}
    </div>
  );
}

function DriverBrief({ driver }: { driver: DeliveryDriver }) {
  const availableCents = driver.credit_limit_cents - driver.credit_held_cents;

  return (
    <DriverMetaTags
      plate={driver.plate}
      motorcycleColor={driver.motorcycle_color}
      compartmentSize={driver.compartment_size}
      creditAvailableCents={availableCents}
      appVersion={driver.app_version}
      appBuildNumber={driver.app_build_number}
      showAppBuild
      className={styles.driverBriefMeta}
    />
  );
}

type DriverFormFieldsProps = {
  form: DriverFormState;
  setForm: React.Dispatch<React.SetStateAction<DriverFormState>>;
  mode: 'create' | 'edit';
  idPrefix: string;
  zones: DeliveryProviderZone[];
  editingDriver: DeliveryDriver | null;
  submitting: boolean;
  formReady: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel?: () => void;
  onFileChange: (field: DocumentField, file: File | null) => void;
};

function DriverFormFields({
  form,
  setForm,
  mode,
  idPrefix,
  zones,
  editingDriver,
  submitting,
  formReady,
  onSubmit,
  onCancel,
  onFileChange,
}: DriverFormFieldsProps) {
  const isEditing = mode === 'edit';

  return (
    <form onSubmit={onSubmit}>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-first-name`}>
            Nombre
          </label>
          <input
            id={`${idPrefix}-first-name`}
            className={styles.input}
            value={form.first_name}
            onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-last-name`}>
            Apellidos
          </label>
          <input
            id={`${idPrefix}-last-name`}
            className={styles.input}
            value={form.last_name}
            onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-phone`}>
            Teléfono
          </label>
          <PhoneInputWithCountry
            compact
            inputId={`${idPrefix}-phone`}
            countryIso={form.phoneCountryIso}
            localNumber={form.phoneLocal}
            hint="Incluye solo el número local, sin lada."
            onCountryChange={(iso) => setForm((prev) => ({ ...prev, phoneCountryIso: iso }))}
            onLocalNumberChange={(value) => setForm((prev) => ({ ...prev, phoneLocal: value }))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-email`}>
            Correo (Google)
          </label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            className={styles.input}
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} id={`${idPrefix}-compartment-label`}>
            Compartimento
          </label>
          <FormSelect
            id={`${idPrefix}-compartment`}
            aria-labelledby={`${idPrefix}-compartment-label`}
            value={form.compartment_size}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'grande', label: 'Grande' },
            ]}
            onChange={(compartment_size) =>
              setForm((prev) => ({
                ...prev,
                compartment_size: compartment_size as DeliveryDriverCompartmentSize,
              }))
            }
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-credit`}>
            Límite de crédito (MXN)
          </label>
          <input
            id={`${idPrefix}-credit`}
            className={styles.input}
            inputMode="decimal"
            value={form.credit_limit_pesos}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, credit_limit_pesos: event.target.value }))
            }
            required={!isEditing}
          />
        </div>
        {isEditing ? (
          <div className={styles.field}>
            <label className={styles.label} id={`${idPrefix}-status-label`}>
              Estado
            </label>
            <FormSelect
              id={`${idPrefix}-status`}
              aria-labelledby={`${idPrefix}-status-label`}
              value={form.status}
              options={[
                { value: 'invited', label: 'Invitado' },
                { value: 'active', label: 'Activo' },
                { value: 'blocked', label: 'Bloqueado' },
              ]}
              onChange={(status) =>
                setForm((prev) => ({
                  ...prev,
                  status: status as DeliveryDriverStatus,
                }))
              }
            />
          </div>
        ) : null}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-plate`}>
            Placa
          </label>
          <input
            id={`${idPrefix}-plate`}
            className={`${styles.input} ${styles.plateInput}`}
            autoCapitalize="characters"
            spellCheck={false}
            value={form.plate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, plate: event.target.value.toUpperCase() }))
            }
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${idPrefix}-brand`}>
            Marca de moto
          </label>
          <input
            id={`${idPrefix}-brand`}
            className={styles.input}
            value={form.motorcycle_brand}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, motorcycle_brand: event.target.value }))
            }
            required
          />
        </div>
        <MotorcycleColorField
          idPrefix={idPrefix}
          value={form.motorcycle_color}
          onChange={(motorcycle_color) => setForm((prev) => ({ ...prev, motorcycle_color }))}
        />
        <div className={styles.field}>
          <label className={styles.label} id={`${idPrefix}-zone-label`}>
            Zona de empresa
          </label>
          <FormSelect
            id={`${idPrefix}-zone`}
            aria-labelledby={`${idPrefix}-zone-label`}
            value={form.registered_zone_id}
            disabled={zones.length === 0}
            placeholder="Crea una zona primero"
            options={
              zones.length === 0
                ? [{ value: '', label: 'Crea una zona primero', disabled: true }]
                : zones.map((zone) => ({ value: zone.id, label: zone.name }))
            }
            onChange={(registered_zone_id) =>
              setForm((prev) => ({ ...prev, registered_zone_id }))
            }
          />
          <p className={styles.fileHint}>
            Solo informativo. El repartidor puede entregar en todas las zonas.
          </p>
        </div>
        <DocumentUploadField
          id={`${idPrefix}-photo`}
          label="Foto de perfil"
          accept="image/jpeg,image/png,image/webp"
          fileName={form.profile_photo_file_name}
          newBase64={form.profile_photo_base64}
          storedPath={editingDriver?.profile_photo_path}
          hint="Imagen, máximo 8 MB"
          onFile={(file) => onFileChange('profile_photo', file)}
        />
        <DocumentUploadField
          id={`${idPrefix}-ine`}
          label="INE"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          fileName={form.ine_document_file_name}
          newBase64={form.ine_document_base64}
          storedPath={editingDriver?.ine_document_path}
          hint="Imagen o PDF, máximo 8 MB"
          onFile={(file) => onFileChange('ine_document', file)}
        />
        <DocumentUploadField
          id={`${idPrefix}-license`}
          label="Licencia"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          fileName={form.license_document_file_name}
          newBase64={form.license_document_base64}
          storedPath={editingDriver?.license_document_path}
          hint="Imagen o PDF, máximo 8 MB"
          onFile={(file) => onFileChange('license_document', file)}
        />
        <DocumentUploadField
          id={`${idPrefix}-insurance`}
          label="Seguro"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          fileName={form.insurance_document_file_name}
          newBase64={form.insurance_document_base64}
          storedPath={editingDriver?.insurance_document_path}
          hint="Imagen o PDF, máximo 8 MB"
          onFile={(file) => onFileChange('insurance_document', file)}
        />
      </div>

      <section className={styles.emergencySection} aria-labelledby={`${idPrefix}-emergency-title`}>
        <div className={styles.emergencySectionHeader}>
          <h3 id={`${idPrefix}-emergency-title`} className={styles.emergencySectionTitle}>
            Contacto de emergencia
          </h3>
          <p className={styles.emergencySectionHint}>
            Persona a contactar si el repartidor no está disponible.
          </p>
        </div>
        <div className={styles.emergencySectionGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${idPrefix}-emergency-name`}>
              Nombre
            </label>
            <input
              id={`${idPrefix}-emergency-name`}
              className={styles.input}
              autoComplete="name"
              value={form.emergency_contact_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, emergency_contact_name: event.target.value }))
              }
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${idPrefix}-emergency-phone`}>
              Celular
            </label>
            <PhoneInputWithCountry
              compact
              inputId={`${idPrefix}-emergency-phone`}
              countryIso={form.emergencyContactPhoneCountryIso}
              localNumber={form.emergencyContactPhoneLocal}
              hint="Incluye solo el número local, sin lada."
              onCountryChange={(iso) =>
                setForm((prev) => ({ ...prev, emergencyContactPhoneCountryIso: iso }))
              }
              onLocalNumberChange={(value) =>
                setForm((prev) => ({ ...prev, emergencyContactPhoneLocal: value }))
              }
            />
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        {onCancel ? (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
        ) : null}
        <button type="submit" className={styles.submitButton} disabled={submitting || !formReady}>
          {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Dar de alta'}
        </button>
      </div>
    </form>
  );
}

export default function DriversPage() {
  const { accessToken } = useAuth();
  const { canWriteProviderConfig } = useDeliveryProviderAccess();
  const { zones, effectiveZoneId } = useDeliveryZone();
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [createForm, setCreateForm] = useState<DriverFormState>(() => createEmptyForm());
  const [createFormKey, setCreateFormKey] = useState(0);
  const [createFormExpanded, setCreateFormExpanded] = useState(true);
  const didInitCreateCollapse = useRef(false);
  const [editForm, setEditForm] = useState<DriverFormState>(() => createEmptyForm());
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const defaultZoneId = effectiveZoneId ?? zones[0]?.id ?? '';

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

  useEffect(() => {
    if (loading || didInitCreateCollapse.current) return;
    if (drivers.length > 0) {
      setCreateFormExpanded(false);
      didInitCreateCollapse.current = true;
    }
  }, [loading, drivers.length]);

  useEffect(() => {
    if (!defaultZoneId) return;
    setCreateForm((prev) =>
      prev.registered_zone_id ? prev : { ...prev, registered_zone_id: defaultZoneId },
    );
  }, [defaultZoneId]);

  const sortedDrivers = useMemo(
    () =>
      [...drivers].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'es'),
      ),
    [drivers],
  );

  const editingDriver = useMemo(
    () => drivers.find((row) => row.id === editingDriverId) ?? null,
    [drivers, editingDriverId],
  );

  const createFormReady = isDriverFormReady(createForm, 'create', zones.length);
  const editFormReady = isDriverFormReady(editForm, 'edit', zones.length);

  function resetCreateForm() {
    setCreateForm(createEmptyForm(defaultZoneId));
    setCreateFormKey((key) => key + 1);
  }

  function patchFormField(
    setter: React.Dispatch<React.SetStateAction<DriverFormState>>,
    field: DocumentField,
    dataUrl: string,
    fileName: string,
  ) {
    setter((prev) => ({
      ...prev,
      [`${field}_base64`]: dataUrl,
      [`${field}_file_name`]: fileName,
    }));
  }

  async function handleCreateFileChange(field: DocumentField, file: File | null) {
    if (!file) return;
    try {
      const { dataUrl, fileName } = await fileToDataUrl(file);
      patchFormField(setCreateForm, field, dataUrl, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    }
  }

  async function handleEditFileChange(field: DocumentField, file: File | null) {
    if (!file) return;
    try {
      const { dataUrl, fileName } = await fileToDataUrl(file);
      patchFormField(setEditForm, field, dataUrl, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    }
  }

  async function reloadEditedDriverFromServer(driverId: string) {
    if (!accessToken) return;
    try {
      const fresh = await getMyDeliveryDriver(accessToken, driverId);
      setDrivers((prev) => prev.map((row) => (row.id === fresh.id ? fresh : row)));
      setEditForm(driverToForm(fresh));
    } catch {
      const rows = await listMyDeliveryDrivers(accessToken);
      setDrivers(rows);
      const fresh = rows.find((row) => row.id === driverId);
      if (fresh) {
        setEditForm(driverToForm(fresh));
      }
    }
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWriteProviderConfig) return;

    setCreateSubmitting(true);
    setError(null);
    setSuccess(null);

    const phone = phoneFromForm(createForm);
    const emergencyPhone = emergencyPhoneFromForm(createForm);
    const registeredZoneId = createForm.registered_zone_id || null;

    try {
      const created = await createMyDeliveryDriver(accessToken, {
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        phone,
        emergency_contact_name: createForm.emergency_contact_name.trim(),
        emergency_contact_phone: emergencyPhone,
        email: createForm.email.trim(),
        compartment_size: createForm.compartment_size,
        plate: createForm.plate.trim().toUpperCase(),
        motorcycle_brand: createForm.motorcycle_brand.trim(),
        motorcycle_color: createForm.motorcycle_color.trim(),
        registered_zone_id: registeredZoneId,
        credit_limit_cents: resolveCreateCreditLimitCents(createForm.credit_limit_pesos),
        profile_photo_base64: createForm.profile_photo_base64,
        profile_photo_file_name: createForm.profile_photo_file_name,
        ine_document_base64: createForm.ine_document_base64,
        ine_document_file_name: createForm.ine_document_file_name,
        license_document_base64: createForm.license_document_base64,
        license_document_file_name: createForm.license_document_file_name,
        insurance_document_base64: createForm.insurance_document_base64,
        insurance_document_file_name: createForm.insurance_document_file_name,
      });
      setDrivers((prev) => [created, ...prev]);
      resetCreateForm();
      setCreateFormExpanded(false);
      setSuccess('Repartidor registrado. Debe iniciar sesión con Google usando el mismo correo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de alta al repartidor');
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWriteProviderConfig || !editingDriverId) return;

    setEditSubmitting(true);
    setError(null);
    setSuccess(null);

    const phone = phoneFromForm(editForm);
    const emergencyPhone = emergencyPhoneFromForm(editForm);
    const registeredZoneId = editForm.registered_zone_id || null;

    try {
      const hasDocumentUpdates =
        editForm.profile_photo_base64 ||
        editForm.ine_document_base64 ||
        editForm.license_document_base64 ||
        editForm.insurance_document_base64;

      if (hasDocumentUpdates) {
        await uploadMyDeliveryDriverDocuments(accessToken, editingDriverId, {
          profile_photo_base64: editForm.profile_photo_base64 || undefined,
          profile_photo_file_name: editForm.profile_photo_file_name,
          ine_document_base64: editForm.ine_document_base64 || undefined,
          ine_document_file_name: editForm.ine_document_file_name,
          license_document_base64: editForm.license_document_base64 || undefined,
          license_document_file_name: editForm.license_document_file_name,
          insurance_document_base64: editForm.insurance_document_base64 || undefined,
          insurance_document_file_name: editForm.insurance_document_file_name,
        });
      }

      const patchBody = applyEditCreditLimitCents(
        {
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          phone,
          emergency_contact_name: editForm.emergency_contact_name.trim(),
          emergency_contact_phone: emergencyPhone,
          email: editForm.email.trim(),
          compartment_size: editForm.compartment_size,
          plate: editForm.plate.trim().toUpperCase(),
          motorcycle_brand: editForm.motorcycle_brand.trim(),
          motorcycle_color: editForm.motorcycle_color.trim(),
          registered_zone_id: registeredZoneId,
          status: editForm.status,
        },
        editForm.credit_limit_pesos,
      );

      const saved = await patchMyDeliveryDriver(accessToken, editingDriverId, patchBody);
      setDrivers((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      handleCloseEdit();
      setSuccess('Cambios guardados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios');
      await reloadEditedDriverFromServer(editingDriverId);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleEditDriver(driver: DeliveryDriver) {
    setEditingDriverId(driver.id);
    setEditForm(driverToForm(driver));
    setError(null);
    setSuccess(null);

    if (!accessToken) return;
    try {
      const fresh = await getMyDeliveryDriver(accessToken, driver.id);
      setDrivers((prev) => prev.map((row) => (row.id === fresh.id ? fresh : row)));
      setEditForm(driverToForm(fresh));
    } catch {
      // Keep list data if detail fetch fails.
    }
  }

  function handleCloseEdit() {
    setEditingDriverId(null);
    setEditForm(createEmptyForm(defaultZoneId));
  }

  return (
    <PanelPageShell
      title="Repartidores"
      subtitle="Da de alta a tu equipo de reparto. Cubren todas las zonas de la empresa. Cada repartidor inicia sesión con Google usando el correo que registres aquí."
      styles={panelStyles as PanelPageStyles}
    >
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          {success}
        </div>
      ) : null}

      {canWriteProviderConfig ? (
        <section
          className={`${styles.formSection} ${createFormExpanded ? styles.formSectionOpen : ''}`}
          aria-labelledby="driver-form-title"
        >
          <button
            type="button"
            className={styles.formToggle}
            aria-expanded={createFormExpanded}
            aria-controls="driver-create-panel"
            onClick={() => setCreateFormExpanded((open) => !open)}
          >
            <span className={styles.formToggleMain}>
              <h2 id="driver-form-title" className={styles.formTitle}>
                Dar de alta
              </h2>
              {!createFormExpanded ? (
                <span className={styles.formSummary}>{createFormSummary(createForm)}</span>
              ) : null}
            </span>
            <span
              className={`${styles.formChevron} ${createFormExpanded ? styles.formChevronExpanded : ''}`}
              aria-hidden
            >
              <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} />
            </span>
          </button>

          <div id="driver-create-panel" className={styles.formPanel} hidden={!createFormExpanded}>
            <p className={styles.formSubtitle}>
              Sube foto y documentos (imagen o PDF, máximo 8 MB cada uno). Las imágenes se convierten
              a WebP; los PDF se conservan. El crédito en efectivo predeterminado es $500 MXN.
            </p>
            <DriverFormFields
              key={createFormKey}
              form={createForm}
              setForm={setCreateForm}
              mode="create"
              idPrefix="create-driver"
              zones={zones}
              editingDriver={null}
              submitting={createSubmitting}
              formReady={createFormReady}
              onSubmit={handleCreateSubmit}
              onFileChange={(field, file) => void handleCreateFileChange(field, file)}
            />
          </div>
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
                    if (canWriteProviderConfig) void handleEditDriver(driver);
                  }}
                  disabled={!canWriteProviderConfig}
                >
                  <DriverAvatar
                    firstName={driver.first_name}
                    lastName={driver.last_name}
                    profilePhotoPath={driver.profile_photo_path}
                  />
                  <div className={styles.main}>
                    <h3 className={styles.name}>
                      {driver.first_name} {driver.last_name}
                    </h3>
                    <p className={styles.meta}>{driver.email}</p>
                    <DriverBrief driver={driver} />
                  </div>
                </button>
                <div className={styles.cardAside}>
                  <div className={styles.chips}>
                    <span className={statusChipClass(driver.status)}>{statusLabel(driver.status)}</span>
                    {driver.is_online ? (
                      <span className={`${styles.chip} ${styles.chipOnline}`}>En línea</span>
                    ) : (
                      <span className={`${styles.chip} ${styles.chipOffline}`}>Offline</span>
                    )}
                  </div>
                  <DriverPhoneContact
                    phone={driver.phone}
                    compact
                    stopPropagation
                    className={styles.asidePhone}
                  />
                  {canWriteProviderConfig ? (
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => void handleEditDriver(driver)}
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

      <RightDrawer
        open={editingDriverId !== null}
        title={
          editingDriver
            ? `Editar · ${editingDriver.first_name} ${editingDriver.last_name}`
            : 'Editar repartidor'
        }
        onClose={handleCloseEdit}
      >
        <p className={styles.drawerHint}>
          Actualiza la ficha del repartidor. Los documentos son opcionales; sube uno nuevo solo si
          quieres reemplazarlo.
        </p>
        <DriverFormFields
          form={editForm}
          setForm={setEditForm}
          mode="edit"
          idPrefix="edit-driver"
          zones={zones}
          editingDriver={editingDriver}
          submitting={editSubmitting}
          formReady={editFormReady}
          onSubmit={handleEditSubmit}
          onCancel={handleCloseEdit}
          onFileChange={(field, file) => void handleEditFileChange(field, file)}
        />
      </RightDrawer>
    </PanelPageShell>
  );
}
