'use client';

import { useEffect, useState } from 'react';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import type { Restaurant } from '@/lib/api/types';
import {
  LIVE_MENU_SOCIAL_PLACEMENT_OPTIONS,
  normalizeLiveMenuSocialPlacement,
  type LiveMenuSocialPlacement,
  validateFacebookUrlInput,
  validateInstagramUrlInput,
  validateSocialLinksForEnable,
} from '@/lib/digital-menu/restaurantSocialLinks';
import styles from './DigitalMenuSocialLinksPanel.module.css';

export type DigitalMenuSocialLinksConfig = {
  enabled: boolean;
  facebookEnabled: boolean;
  instagramEnabled: boolean;
  whatsappEnabled: boolean;
  placement: LiveMenuSocialPlacement;
  facebookUrl: string;
  instagramUrl: string;
};

export function digitalMenuSocialLinksConfigFromRestaurant(
  restaurant: Restaurant | null | undefined,
): DigitalMenuSocialLinksConfig {
  return {
    enabled: restaurant?.live_menu_social_enabled ?? false,
    facebookEnabled: restaurant?.live_menu_social_facebook_enabled ?? false,
    instagramEnabled: restaurant?.live_menu_social_instagram_enabled ?? false,
    whatsappEnabled: restaurant?.live_menu_social_whatsapp_enabled ?? false,
    placement: normalizeLiveMenuSocialPlacement(restaurant?.live_menu_social_placement),
    facebookUrl: restaurant?.facebook_url ?? '',
    instagramUrl: restaurant?.instagram_url ?? '',
  };
}

type DigitalMenuSocialLinksPanelProps = {
  config: DigitalMenuSocialLinksConfig;
  whatsappConfigured: boolean;
  saving?: boolean;
  error?: string | null;
  onChange: (patch: Partial<DigitalMenuSocialLinksConfig>) => void;
};

export function DigitalMenuSocialLinksPanel({
  config,
  whatsappConfigured,
  saving = false,
  error,
  onChange,
}: DigitalMenuSocialLinksPanelProps) {
  const [facebookDraft, setFacebookDraft] = useState(config.facebookUrl);
  const [instagramDraft, setInstagramDraft] = useState(config.instagramUrl);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setFacebookDraft(config.facebookUrl);
  }, [config.facebookUrl]);

  useEffect(() => {
    setInstagramDraft(config.instagramUrl);
  }, [config.instagramUrl]);

  const panelDisabled = !config.enabled || saving;

  const nextConfig = (patch: Partial<DigitalMenuSocialLinksConfig>): DigitalMenuSocialLinksConfig => ({
    ...config,
    ...patch,
    facebookUrl: patch.facebookUrl ?? config.facebookUrl,
    instagramUrl: patch.instagramUrl ?? config.instagramUrl,
  });

  const validateAndPersist = (patch: Partial<DigitalMenuSocialLinksConfig>) => {
    const candidate = nextConfig(patch);
    const validationError = validateSocialLinksForEnable({
      enabled: candidate.enabled,
      facebookEnabled: candidate.facebookEnabled,
      instagramEnabled: candidate.instagramEnabled,
      whatsappEnabled: candidate.whatsappEnabled,
      facebook_url: patch.facebookUrl ?? facebookDraft,
      instagram_url: patch.instagramUrl ?? instagramDraft,
      whatsappConfigured,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    onChange(patch);
  };

  const commitFacebook = () => {
    const trimmed = facebookDraft.trim();
    const validationError = validateFacebookUrlInput(trimmed);
    if (validationError) {
      setFacebookError(validationError);
      return;
    }
    setFacebookError(null);
    if (trimmed === config.facebookUrl.trim()) return;
    validateAndPersist({ facebookUrl: trimmed });
  };

  const commitInstagram = () => {
    const trimmed = instagramDraft.trim();
    const validationError = validateInstagramUrlInput(trimmed);
    if (validationError) {
      setInstagramError(validationError);
      return;
    }
    setInstagramError(null);
    if (trimmed === config.instagramUrl.trim()) return;
    validateAndPersist({ instagramUrl: trimmed });
  };

  const handleMasterToggle = (enabled: boolean) => {
    if (enabled) {
      validateAndPersist({ enabled: true });
      return;
    }
    setFormError(null);
    onChange({ enabled: false });
  };

  return (
    <section className={styles.panel} aria-labelledby="dm-social-links-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitleRow}>
          <ShareOutlinedIcon sx={{ fontSize: 20 }} aria-hidden />
          <h2 id="dm-social-links-title" className={styles.panelTitle}>
            Redes sociales
          </h2>
        </div>
        <p className={styles.panelHint}>
          Elige qué redes mostrar y dónde aparecen en tu menú en vivo. WhatsApp usa el número de
          pedidos de Configuración. “Sobre la portada” funciona mejor para destacar; el final del
          menú es la opción más discreta.
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={saving}
            onChange={(event) => handleMasterToggle(event.target.checked)}
          />
          <span>Mostrar redes en el menú en vivo</span>
        </label>

        <fieldset className={styles.placementFieldset} disabled={panelDisabled}>
          <legend className={styles.fieldLabel}>Ubicación en el menú</legend>
          <div className={styles.placementOptions}>
            {LIVE_MENU_SOCIAL_PLACEMENT_OPTIONS.map((option) => (
              <label key={option.value} className={styles.placementOption}>
                <input
                  type="radio"
                  name="dm-social-placement"
                  value={option.value}
                  checked={config.placement === option.value}
                  onChange={() => validateAndPersist({ placement: option.value })}
                />
                <span className={styles.placementCopy}>
                  <span className={styles.placementLabel}>{option.label}</span>
                  <span className={styles.placementHint}>{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.channelBlock}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={config.facebookEnabled}
              disabled={panelDisabled}
              onChange={(event) => validateAndPersist({ facebookEnabled: event.target.checked })}
            />
            <span>Facebook</span>
          </label>
          <input
            id="dm-facebook-url"
            className={`${styles.textInput} ${facebookError ? styles.textInputError : ''}`.trim()}
            value={facebookDraft}
            disabled={panelDisabled || !config.facebookEnabled}
            placeholder="https://facebook.com/tunegocio"
            onChange={(event) => {
              setFacebookDraft(event.target.value);
              if (facebookError) setFacebookError(null);
            }}
            onBlur={commitFacebook}
          />
          {facebookError ? <p className={styles.fieldError}>{facebookError}</p> : null}
        </div>

        <div className={styles.channelBlock}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={config.instagramEnabled}
              disabled={panelDisabled}
              onChange={(event) => validateAndPersist({ instagramEnabled: event.target.checked })}
            />
            <span>Instagram</span>
          </label>
          <input
            id="dm-instagram-url"
            className={`${styles.textInput} ${instagramError ? styles.textInputError : ''}`.trim()}
            value={instagramDraft}
            disabled={panelDisabled || !config.instagramEnabled}
            placeholder="https://instagram.com/tunegocio"
            onChange={(event) => {
              setInstagramDraft(event.target.value);
              if (instagramError) setInstagramError(null);
            }}
            onBlur={commitInstagram}
          />
          {instagramError ? <p className={styles.fieldError}>{instagramError}</p> : null}
        </div>

        <div className={styles.channelBlock}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={config.whatsappEnabled}
              disabled={panelDisabled}
              onChange={(event) => validateAndPersist({ whatsappEnabled: event.target.checked })}
            />
            <span>WhatsApp</span>
          </label>
          <p className={styles.fieldHint}>
            {whatsappConfigured
              ? 'Se mostrará con tu número de pedidos.'
              : 'Configura WhatsApp de pedidos en Configuración para activarlo.'}
          </p>
        </div>

        {formError || error ? (
          <p className={styles.fieldError}>{formError ?? error}</p>
        ) : null}
      </div>
    </section>
  );
}
