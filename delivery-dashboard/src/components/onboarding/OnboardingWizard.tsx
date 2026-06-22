'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { ServiceZoneMapDrawer } from '@/components/onboarding/ServiceZoneMapDrawer';
import { useAuth } from '@/hooks/useAuth';
import { prepareImageForUpload } from '@/lib/image/convertToWebp';
import { createDefaultOnboardingData } from '@/lib/onboarding/defaults';
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
import styles from './OnboardingWizard.module.css';

const STEP_COPY: Record<
  OnboardingStepId,
  { title: string; subtitle: string; questionLabel: string }
> = {
  companyName: {
    questionLabel: 'Paso 1',
    title: '¿Cómo se llama tu empresa de delivery?',
    subtitle: 'Este nombre aparecerá en tu perfil y en la comunicación con restaurantes.',
  },
  responsibleName: {
    questionLabel: 'Paso 2',
    title: '¿Quién es el responsable?',
    subtitle: 'Persona de contacto principal de la empresa.',
  },
  responsiblePhone: {
    questionLabel: 'Paso 3',
    title: '¿Cuál es el celular del responsable?',
    subtitle: 'Lo usaremos para validar tu registro y contactarte si es necesario.',
  },
  whatsapp: {
    questionLabel: 'Paso 4',
    title: '¿Cuál es el WhatsApp de la empresa?',
    subtitle: 'Número oficial de la empresa de delivery para operaciones.',
  },
  serviceZone: {
    questionLabel: 'Paso 5',
    title: 'Define tu zona de reparto',
    subtitle: 'Busca tu zona en el mapa y dibuja el área donde realizas entregas.',
  },
  logo: {
    questionLabel: 'Paso final',
    title: 'Sube el logo de tu empresa',
    subtitle: 'Se mostrará en la página de inicio de tu empresa de delivery.',
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<OnboardingData>(() => createDefaultOnboardingData());
  const [currentStepId, setCurrentStepId] = useState<OnboardingStepId>('companyName');
  const [hydrated, setHydrated] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const visibleSteps = useMemo(() => getVisibleSteps(), []);
  const currentIndex = stepIndex(visibleSteps, currentStepId);
  const progressPercent =
    visibleSteps.length > 1
      ? Math.round(((currentIndex + 1) / visibleSteps.length) * 100)
      : 100;

  const copy = STEP_COPY[currentStepId];

  useEffect(() => {
    const saved = loadOnboardingState(userId);
    if (saved) {
      setData(saved.data);
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

  const patchData = useCallback((patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setStepError(null);
  }, []);

  const handleServiceZonePolygonChange = useCallback(
    (polygon: OnboardingData['serviceZonePolygon']) => {
      patchData({ serviceZonePolygon: polygon });
    },
    [patchData],
  );

  const goNext = useCallback(async () => {
    const validationError = validateStep(currentStepId, data);
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
      await submitOnboarding(accessToken, data);
      clearOnboardingState(userId);
      onComplete();
    } catch (error) {
      console.error(error);
      setSubmitError('No se pudo enviar tu registro. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, currentIndex, currentStepId, data, onComplete, userId, visibleSteps]);

  const goBack = () => {
    const prevStep = visibleSteps[currentIndex - 1];
    if (prevStep) {
      setCurrentStepId(prevStep);
      setStepError(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && currentStepId !== 'serviceZone') {
      event.preventDefault();
      void goNext();
    }
  };

  const handleImagePick = async (file: File) => {
    try {
      const stored = await fileToStoredImage(file);
      patchData({ logoDataUrl: stored.dataUrl, logoFileName: stored.fileName });
    } catch (error) {
      console.error(error);
      setStepError('No se pudo procesar la imagen. Prueba con otro archivo.');
    }
  };

  const renderStepContent = () => {
    switch (currentStepId) {
      case 'companyName':
        return (
          <input
            className={styles.textInput}
            value={data.companyName}
            placeholder="Ej. Mexy Reparto"
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={(e) => patchData({ companyName: e.target.value })}
          />
        );

      case 'responsibleName':
        return (
          <input
            className={styles.textInput}
            value={data.responsibleName}
            placeholder="Nombre completo"
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={(e) => patchData({ responsibleName: e.target.value })}
          />
        );

      case 'responsiblePhone':
        return (
          <PhoneInputWithCountry
            countryIso={data.responsiblePhoneCountryIso}
            localNumber={data.responsiblePhoneLocal}
            autoFocus
            hint="Incluye solo el número local, sin lada."
            onCountryChange={(iso) => patchData({ responsiblePhoneCountryIso: iso })}
            onLocalNumberChange={(value) => patchData({ responsiblePhoneLocal: value })}
          />
        );

      case 'whatsapp':
        return (
          <PhoneInputWithCountry
            countryIso={data.whatsappCountryIso}
            localNumber={data.whatsappLocal}
            autoFocus
            hint="WhatsApp oficial de la empresa de delivery."
            showSameAsOwner
            onCountryChange={(iso) =>
              patchData({ whatsappCountryIso: iso, whatsappSameAsResponsible: false })
            }
            onLocalNumberChange={(value) =>
              patchData({ whatsappLocal: value, whatsappSameAsResponsible: false })
            }
            onUseSameAsOwner={() =>
              patchData({
                whatsappCountryIso: data.responsiblePhoneCountryIso,
                whatsappLocal: data.responsiblePhoneLocal,
                whatsappSameAsResponsible: true,
              })
            }
          />
        );

      case 'serviceZone':
        return (
          <div className={styles.mapWrap}>
            <ServiceZoneMapDrawer
              polygon={data.serviceZonePolygon}
              searchAddress={data.serviceZoneSearchAddress}
              centerLat={data.serviceZoneCenterLat}
              centerLng={data.serviceZoneCenterLng}
              onSearchPlaceChange={(place) =>
                patchData({
                  serviceZoneSearchAddress: place.address,
                  serviceZoneCenterLat: place.latitude,
                  serviceZoneCenterLng: place.longitude,
                })
              }
              onPolygonChange={handleServiceZonePolygonChange}
            />
          </div>
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
                if (file) void handleImagePick(file);
                e.target.value = '';
              }}
            />
          </div>
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
          <span className={styles.questionNumber}>{copy.questionLabel}</span>
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
          <button
            type="button"
            className={styles.continueBtn}
            disabled={submitting}
            onClick={() => void goNext()}
          >
            {submitting ? 'Enviando…' : isLastStep ? 'Enviar registro' : 'Continuar'}
          </button>
        </div>
      </footer>

      {submitting ? (
        <div className={styles.submittingOverlay} role="status" aria-live="polite">
          Enviando tu información…
        </div>
      ) : null}
    </div>
  );
}
