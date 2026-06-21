'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { OnboardingScheduleEditor } from '@/components/onboarding/OnboardingScheduleEditor';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { RestaurantLocationMapPicker } from '@/components/settings/RestaurantLocationMapPicker';
import type { RestaurantLocationMapPickerHandle } from '@/components/settings/RestaurantLocationMapPicker';
import { RestaurantPlaceAutocomplete } from '@/components/settings/RestaurantPlaceAutocomplete';
import { useAuth } from '@/hooks/useAuth';
import { createDefaultOnboardingData } from '@/lib/onboarding/defaults';
import { normalizeOnboardingScheduleDrafts } from '@/lib/onboarding/schedule';
import {
  clearOnboardingState,
  getVisibleSteps,
  loadOnboardingState,
  saveOnboardingState,
  stepIndex,
} from '@/lib/onboarding/storage';
import { submitOnboarding } from '@/lib/onboarding/submitOnboarding';
import type { OnboardingData, OnboardingStepId } from '@/lib/onboarding/types';
import { validateStep } from '@/lib/onboarding/validation';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { reverseGeocodeCoordinates, type MapLocationUpdate } from '@/lib/loadGoogleMapsPlaces';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  type PaymentMethodKey,
} from '@/lib/restaurantPaymentConfig';
import { RESTAURANT_SERVICE_LABELS } from '@/lib/restaurantServices';
import styles from './OnboardingWizard.module.css';

const STEP_COPY: Record<
  OnboardingStepId,
  { title: string; subtitle: string; questionLabel: string }
> = {
  businessName: {
    questionLabel: 'Paso 1',
    title: '¿Cómo se llama tu negocio?',
    subtitle: 'Este nombre aparecerá en tu menú digital y en las comunicaciones con tus clientes.',
  },
  description: {
    questionLabel: 'Opcional',
    title: '¿Cómo describirías tu negocio?',
    subtitle: 'Una breve presentación para tus clientes en el menú digital. Puedes omitir este paso.',
  },
  ownerName: {
    questionLabel: 'Paso 2',
    title: '¿Quién es el responsable del negocio?',
    subtitle: 'Persona de contacto principal para temas administrativos.',
  },
  ownerPhone: {
    questionLabel: 'Paso 3',
    title: '¿Cuál es el celular del responsable?',
    subtitle: 'Lo usaremos solo para contactarte sobre tu cuenta.',
  },
  branchCount: {
    questionLabel: 'Paso 4',
    title: '¿Cuántas sucursales tiene tu negocio?',
    subtitle: 'Si tienes un local, deja el valor en 1.',
  },
  logo: {
    questionLabel: 'Paso 5',
    title: 'Sube el logo de tu negocio',
    subtitle: 'Un logo claro ayuda a que tus clientes te reconozcan al instante.',
  },
  cover: {
    questionLabel: 'Paso 6',
    title: 'Sube la foto de portada',
    subtitle: 'Esta imagen se mostrará en la página principal de tu menú digital.',
  },
  location: {
    questionLabel: 'Paso 7',
    title: '¿Dónde está ubicado tu negocio?',
    subtitle: 'Busca tu dirección y ajusta el pin para marcar la entrada exacta.',
  },
  schedule: {
    questionLabel: 'Paso 8',
    title: '¿Cuál es el horario de tu negocio?',
    subtitle: 'Ajusta el horario de acuerdo a tu negocio.',
  },
  orderTypes: {
    questionLabel: 'Paso 9',
    title: '¿Qué tipos de pedido quieres ofrecer?',
    subtitle: 'Entrega a domicilio, recoger en tienda o ambos. Todos vienen activados por defecto. Desactiva los que no ofrezca tu negocio.',
  },
  paymentMethods: {
    questionLabel: 'Paso 10',
    title: '¿Qué métodos de pago aceptas en tu establecimiento?',
    subtitle: 'Todos vienen activados. Desactiva los que no uses.',
  },
  whatsapp: {
    questionLabel: 'Paso final',
    title: '¿Cuál es el WhatsApp de tu negocio?',
    subtitle: 'Tus clientes podrán contactarte por este número para pedidos y dudas.',
  },
};

async function fileToStoredImage(file: File): Promise<{ dataUrl: string; fileName: string }> {
  const optimized = await prepareImageForUpload(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(optimized);
  });
  return { dataUrl, fileName: optimized.name };
}

type OnboardingWizardProps = {
  userId: string;
  onComplete: () => void;
};

export default function OnboardingWizard({ userId, onComplete }: OnboardingWizardProps) {
  const { accessToken } = useAuth();
  const mapPickerRef = useRef<RestaurantLocationMapPickerHandle>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [currentStepId, setCurrentStepId] = useState<OnboardingStepId>('businessName');
  const [hydrated, setHydrated] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const visibleSteps = useMemo(() => getVisibleSteps(data), [data]);
  const currentIndex = stepIndex(visibleSteps, currentStepId);
  const progressPercent =
    visibleSteps.length > 1
      ? Math.round(((currentIndex + 1) / visibleSteps.length) * 100)
      : 100;

  const copy = STEP_COPY[currentStepId];

  useEffect(() => {
    const saved = loadOnboardingState(userId);
    if (saved) {
      setData({
        ...saved.data,
        scheduleDrafts: normalizeOnboardingScheduleDrafts(saved.data.scheduleDrafts),
      });
      setCurrentStepId(saved.progress.currentStepId);
    }
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveOnboardingState(userId, data, {
      currentStepId,
      updatedAt: new Date().toISOString(),
    });
  }, [userId, data, currentStepId, hydrated]);

  useEffect(() => {
    if (!visibleSteps.includes(currentStepId)) {
      setCurrentStepId(visibleSteps[visibleSteps.length - 1] ?? 'businessName');
    }
  }, [visibleSteps, currentStepId]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return;

    const syncKeyboardOffset = () => {
      const keyboardOffset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      page.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
    };

    viewport.addEventListener('resize', syncKeyboardOffset);
    viewport.addEventListener('scroll', syncKeyboardOffset);
    syncKeyboardOffset();

    return () => {
      viewport.removeEventListener('resize', syncKeyboardOffset);
      viewport.removeEventListener('scroll', syncKeyboardOffset);
      page.style.removeProperty('--keyboard-offset');
    };
  }, []);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('input, textarea, select, button[aria-haspopup="listbox"]')) return;

      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [currentStepId]);

  const patchData = useCallback((patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setStepError(null);
  }, []);

  const handleMapLocationChange = useCallback((update: MapLocationUpdate) => {
    if (update.address) {
      setData((prev) => ({
        ...prev,
        location: {
          address: update.address!,
          latitude: update.latitude,
          longitude: update.longitude,
          placeId: update.placeId ?? null,
        },
      }));
      setStepError(null);
      return;
    }

    setData((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        latitude: update.latitude,
        longitude: update.longitude,
        placeId: null,
      },
    }));
    setStepError(null);

    void reverseGeocodeCoordinates(update.latitude, update.longitude)
      .then((address) => {
        if (!address) return;
        setData((prev) => ({
          ...prev,
          location: {
            ...prev.location,
            latitude: update.latitude,
            longitude: update.longitude,
            address,
            placeId: null,
          },
        }));
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  const goNext = useCallback(async () => {
    let payload = data;

    if (currentStepId === 'location') {
      const markerCoords = mapPickerRef.current?.getPosition();
      if (markerCoords) {
        const address =
          (await reverseGeocodeCoordinates(markerCoords.latitude, markerCoords.longitude)) ??
          data.location.address;
        payload = {
          ...data,
          location: {
            ...data.location,
            latitude: markerCoords.latitude,
            longitude: markerCoords.longitude,
            address,
            placeId: null,
          },
        };
        setData(payload);
      }
    }

    const validationError = validateStep(currentStepId, payload);
    if (validationError) {
      setStepError(validationError);
      return;
    }

    const nextStep = visibleSteps[currentIndex + 1];
    if (nextStep) {
      setCurrentStepId(nextStep);
      setStepError(null);
      return;
    }

    if (!accessToken) {
      setSubmitError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitOnboarding(accessToken, payload);
      clearOnboardingState(userId);
      onComplete();
    } catch (error) {
      console.error(error);
      setSubmitError('No se pudo guardar tu negocio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, currentIndex, currentStepId, data, onComplete, userId, visibleSteps]);

  const goSkipOptionalStep = useCallback(() => {
    if (currentStepId !== 'description') return;

    const nextStep = visibleSteps[currentIndex + 1];
    if (!nextStep) return;

    setData((prev) => ({ ...prev, businessDescription: '' }));
    setCurrentStepId(nextStep);
    setStepError(null);
  }, [currentIndex, currentStepId, visibleSteps]);

  const goBack = () => {
    const prevStep = visibleSteps[currentIndex - 1];
    if (prevStep) {
      setCurrentStepId(prevStep);
      setStepError(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void goNext();
    }
  };

  const handleImagePick = async (
    file: File,
    field: 'logo' | 'cover',
  ) => {
    try {
      const stored = await fileToStoredImage(file);
      if (field === 'logo') {
        patchData({ logoDataUrl: stored.dataUrl, logoFileName: stored.fileName });
      } else {
        patchData({ coverDataUrl: stored.dataUrl, coverFileName: stored.fileName });
      }
    } catch (error) {
      console.error(error);
      setStepError('No se pudo procesar la imagen. Prueba con otro archivo.');
    }
  };

  const togglePayment = (method: PaymentMethodKey, enabled: boolean) => {
    patchData({
      paymentMatrix: {
        ...data.paymentMatrix,
        takeout: { ...data.paymentMatrix.takeout, [method]: enabled },
      },
    });
  };

  const renderStepContent = () => {
    switch (currentStepId) {
      case 'businessName':
        return (
          <input
            className={styles.textInput}
            value={data.businessName}
            placeholder="Ej. Taquería El Sol"
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={(e) => patchData({ businessName: e.target.value })}
          />
        );

      case 'description':
        return (
          <div className={styles.descriptionWrap}>
            <textarea
              className={styles.textArea}
              value={data.businessDescription}
              placeholder="Ej. Taquería con tortillas hechas a mano y ambiente familiar."
              autoFocus
              rows={4}
              maxLength={500}
              aria-label="Descripción del negocio"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.metaKey) {
                  event.preventDefault();
                  void goNext();
                }
              }}
              onChange={(e) => patchData({ businessDescription: e.target.value })}
            />
            <p className={styles.charCount} aria-live="polite">
              {data.businessDescription.length}/500
            </p>
          </div>
        );

      case 'ownerName':
        return (
          <input
            className={styles.textInput}
            value={data.ownerName}
            placeholder="Nombre completo"
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={(e) => patchData({ ownerName: e.target.value })}
          />
        );

      case 'ownerPhone':
        return (
          <PhoneInputWithCountry
            countryIso={data.ownerPhoneCountryIso}
            localNumber={data.ownerPhoneLocal}
            autoFocus
            hint="Incluye solo el número local, sin lada."
            onCountryChange={(iso) => patchData({ ownerPhoneCountryIso: iso })}
            onLocalNumberChange={(value) => patchData({ ownerPhoneLocal: value })}
          />
        );

      case 'branchCount':
        return (
          <input
            type="number"
            min={1}
            max={999}
            className={styles.numberInput}
            value={data.branchCount}
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={(e) => patchData({ branchCount: Number(e.target.value) || 1 })}
          />
        );

      case 'logo':
        return (
          <div className={styles.uploadZone}>
            {data.logoDataUrl ? (
              <img src={data.logoDataUrl} alt="Vista previa del logo" className={styles.previewImage} />
            ) : null}
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => logoInputRef.current?.click()}
            >
              <CloudUploadOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
              {data.logoDataUrl ? 'Cambiar logo' : 'Seleccionar imagen'}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImagePick(file, 'logo');
                e.target.value = '';
              }}
            />
          </div>
        );

      case 'cover':
        return (
          <div className={styles.uploadZone}>
            {data.coverDataUrl ? (
              <img
                src={data.coverDataUrl}
                alt="Vista previa de portada"
                className={styles.coverPreview}
              />
            ) : null}
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => coverInputRef.current?.click()}
            >
              <CloudUploadOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
              {data.coverDataUrl ? 'Cambiar portada' : 'Seleccionar imagen'}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImagePick(file, 'cover');
                e.target.value = '';
              }}
            />
          </div>
        );

      case 'location':
        return (
          <div className={styles.locationWrap}>
            <RestaurantPlaceAutocomplete
              onPlaceSelected={(place) =>
                patchData({
                  location: {
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    placeId: place.placeId,
                  },
                })
              }
            />
            <input
              className={`${styles.addressInput} ${styles.addressInputReadOnly}`}
              value={data.location.address}
              placeholder="Busca una dirección arriba para verla aquí"
              readOnly
              aria-readonly="true"
              tabIndex={-1}
            />
            <div className={styles.mapWrap}>
              <RestaurantLocationMapPicker
                ref={mapPickerRef}
                latitude={data.location.latitude}
                longitude={data.location.longitude}
                saveHintLabel="Continuar"
                onLocationChange={handleMapLocationChange}
              />
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className={styles.scheduleWrap}>
            <OnboardingScheduleEditor
              drafts={data.scheduleDrafts}
              onChange={(drafts) => patchData({ scheduleDrafts: drafts })}
              onValidationError={setStepError}
            />
          </div>
        );

      case 'orderTypes':
        return (
          <div className={styles.optionList}>
            <label
              className={`${styles.optionCard} ${data.deliveryEnabled ? styles.optionCardActive : ''}`}
            >
              <div className={styles.optionMeta}>
                <span className={styles.optionTitle}>{RESTAURANT_SERVICE_LABELS.delivery}</span>
                <span className={styles.optionHint}>Llevamos el pedido hasta tu cliente. Servicio por Mexy Reparto.</span>
              </div>
              <span className={styles.switch}>
                <input
                  type="checkbox"
                  checked={data.deliveryEnabled}
                  onChange={(e) => patchData({ deliveryEnabled: e.target.checked })}
                />
                <span className={styles.slider} />
              </span>
            </label>

            <label
              className={`${styles.optionCard} ${data.takeoutEnabled ? styles.optionCardActive : ''}`}
            >
              <div className={styles.optionMeta}>
                <span className={styles.optionTitle}>{RESTAURANT_SERVICE_LABELS.takeout}</span>
                <span className={styles.optionHint}>Tus clientes recogen su pedido directamente en tu establecimiento.</span>
              </div>
              <span className={styles.switch}>
                <input
                  type="checkbox"
                  checked={data.takeoutEnabled}
                  onChange={(e) => patchData({ takeoutEnabled: e.target.checked })}
                />
                <span className={styles.slider} />
              </span>
            </label>
          </div>
        );

      case 'paymentMethods':
        return (
          <div className={styles.optionList}>
            {PAYMENT_METHOD_ORDER.map((method) => (
              <label
                key={method}
                className={`${styles.optionCard} ${
                  data.paymentMatrix.takeout[method] ? styles.optionCardActive : ''
                }`}
              >
                <div className={styles.optionMeta}>
                  <span className={styles.optionTitle}>{PAYMENT_METHOD_LABELS[method]}</span>
                </div>
                <span className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={data.paymentMatrix.takeout[method]}
                    onChange={(e) => togglePayment(method, e.target.checked)}
                  />
                  <span className={styles.slider} />
                </span>
              </label>
            ))}
          </div>
        );

      case 'whatsapp':
        return (
          <PhoneInputWithCountry
            countryIso={data.whatsappCountryIso}
            localNumber={data.whatsappLocal}
            autoFocus
            hint="Número donde recibirás pedidos por WhatsApp."
            showSameAsOwner
            onCountryChange={(iso) =>
              patchData({ whatsappCountryIso: iso, whatsappSameAsOwner: false })
            }
            onLocalNumberChange={(value) =>
              patchData({ whatsappLocal: value, whatsappSameAsOwner: false })
            }
            onUseSameAsOwner={() =>
              patchData({
                whatsappCountryIso: data.ownerPhoneCountryIso,
                whatsappLocal: data.ownerPhoneLocal,
                whatsappSameAsOwner: true,
              })
            }
          />
        );

      default:
        return null;
    }
  };

  if (!hydrated) {
    return <div className={styles.loadingScreen}>Preparando tu registro…</div>;
  }

  const isLastStep = currentIndex === visibleSteps.length - 1;

  return (
    <div className={styles.page} ref={pageRef}>
      <div className={styles.progressTrack} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
      </div>

      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          disabled={currentIndex === 0 || submitting}
          onClick={goBack}
        >
          <ArrowBackOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
          Atrás
        </button>
        <span className={styles.stepCounter}>
          {currentIndex + 1} / {visibleSteps.length}
        </span>
      </header>

      <main className={styles.main}>
        <section className={styles.stepCard} aria-live="polite">
          <span
            className={`${styles.questionNumber} ${
              currentStepId === 'description' ? styles.questionNumberOptional : ''
            }`}
          >
            {copy.questionLabel}
          </span>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.subtitle}>{copy.subtitle}</p>
          {renderStepContent()}
          {stepError ? (
            <p className={styles.error} role="alert">
              {stepError}
            </p>
          ) : null}
          {submitError ? (
            <p className={styles.error} role="alert">
              {submitError}
            </p>
          ) : null}
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerActions}>
          {currentStepId === 'description' ? (
            <button
              type="button"
              className={styles.skipBtn}
              disabled={submitting}
              onClick={goSkipOptionalStep}
            >
              Omitir
            </button>
          ) : null}
          <button
            type="button"
            className={styles.continueBtn}
            disabled={submitting}
            onClick={() => void goNext()}
          >
            {submitting
              ? 'Guardando…'
              : isLastStep
                ? 'Finalizar'
                : currentStepId === 'description' && !data.businessDescription.trim()
                  ? 'Continuar sin descripción'
                  : 'Continuar'}
          </button>
        </div>
      </footer>

      {submitting ? (
        <div className={styles.submittingOverlay} role="status" aria-live="polite">
          Creando tu negocio…
        </div>
      ) : null}
    </div>
  );
}
