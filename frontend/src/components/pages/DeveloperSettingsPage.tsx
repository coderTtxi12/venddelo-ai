'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import {
  getDeveloperSettings,
  rotateDeveloperWebhookSecret,
  testDeveloperWebhook,
  updateDeveloperWebhook,
  type DeveloperSettings,
  type DeveloperWebhook,
} from '@/lib/api/developer';
import { ApiError } from '@/lib/api/types';
import styles from '@/components/settings/DeveloperSettingsPanel.module.css';

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden />
    </label>
  );
}

export default function DeveloperSettingsPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const { selectedRestaurantId, memberRole, loading: accessLoading } = useRestaurantAccess();
  const [settings, setSettings] = useState<DeveloperSettings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);

  const canManage = memberRole === 'owner' || memberRole === 'admin';

  const load = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getDeveloperSettings(accessToken, selectedRestaurantId);
      setSettings(data);
      setWebhookUrl(data.webhook.url ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId, canManage]);

  useEffect(() => {
    if (authLoading || accessLoading) return;
    void load();
  }, [authLoading, accessLoading, load]);

  const applyWebhook = (webhook: DeveloperWebhook) => {
    setSettings((prev) => (prev ? { ...prev, webhook } : prev));
    if (webhook.url) setWebhookUrl(webhook.url);
  };

  const saveUrl = async (url: string, extra?: Partial<DeveloperWebhook>) => {
    if (!accessToken || !selectedRestaurantId || !settings) return null;
    const webhook = await updateDeveloperWebhook(accessToken, selectedRestaurantId, {
      url: url.trim() || null,
      is_enabled: extra?.is_enabled ?? settings.webhook.is_enabled,
      notify_status: extra?.notify_status ?? settings.webhook.notify_status,
      notify_location: extra?.notify_location ?? settings.webhook.notify_location,
    });
    applyWebhook(webhook);
    return webhook;
  };

  const tryNow = async () => {
    if (!accessToken || !selectedRestaurantId || !settings) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (!settings.webhook.has_signing_secret) {
        const secret = await rotateDeveloperWebhookSecret(accessToken, selectedRestaurantId);
        setSecretOnce(secret.signing_secret);
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                webhook: {
                  ...prev.webhook,
                  has_signing_secret: true,
                  secret_hint: secret.secret_hint,
                },
              }
            : prev,
        );
      }
      await updateDeveloperWebhook(accessToken, selectedRestaurantId, {
        url: settings.test_sink.post_url,
        is_enabled: true,
        notify_status: true,
        notify_location: true,
      });
      const fresh = await getDeveloperSettings(accessToken, selectedRestaurantId);
      setSettings((prev) =>
        prev
          ? { ...fresh, webhook: { ...fresh.webhook } }
          : fresh,
      );
      setWebhookUrl(fresh.webhook.url ?? settings.test_sink.post_url);
      const test = await testDeveloperWebhook(accessToken, selectedRestaurantId);
      if (!test.ok) {
        setError(test.error ?? 'La prueba no llegó. Revisa la URL.');
      } else {
        setNote('Listo. Ya enviamos un aviso de prueba. Ábrelo abajo.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo configurar la prueba');
    } finally {
      setBusy(false);
    }
  };

  const onSaveCustom = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await saveUrl(webhookUrl);
      setNote('URL guardada.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const onNewSecret = async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setBusy(true);
    setError(null);
    try {
      const secret = await rotateDeveloperWebhookSecret(accessToken, selectedRestaurantId);
      setSecretOnce(secret.signing_secret);
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              webhook: {
                ...prev.webhook,
                has_signing_secret: true,
                secret_hint: secret.secret_hint,
              },
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el secreto');
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (patch: {
    is_enabled?: boolean;
    notify_status?: boolean;
    notify_location?: boolean;
  }) => {
    if (!accessToken || !selectedRestaurantId || !settings) return;
    setBusy(true);
    setError(null);
    try {
      const webhook = await updateDeveloperWebhook(accessToken, selectedRestaurantId, {
        url: webhookUrl.trim() || settings.webhook.url,
        is_enabled: patch.is_enabled ?? settings.webhook.is_enabled,
        notify_status: patch.notify_status ?? settings.webhook.notify_status,
        notify_location: patch.notify_location ?? settings.webhook.notify_location,
      });
      applyWebhook(webhook);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const test = await testDeveloperWebhook(accessToken, selectedRestaurantId);
      if (test.ok) setNote('Prueba enviada. Revisa tu servidor o los eventos de abajo.');
      else setError(test.error ?? 'Tu URL no respondió bien.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo probar');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!secretOnce) return;
    try {
      await navigator.clipboard.writeText(secretOnce);
      setNote('Secreto copiado.');
    } catch {
      setError('No se pudo copiar. Selecciónalo a mano.');
    }
  };

  if (!canManage && !accessLoading && !authLoading) {
    return (
      <div className={styles.page}>
        <Link href="/settings" className={styles.backLink}>← Configuración</Link>
        <p className={styles.subtitle}>Solo el dueño o un administrador puede usar esto.</p>
      </div>
    );
  }

  const live = Boolean(settings?.webhook.is_enabled && settings.webhook.url);

  return (
    <div className={styles.page}>
      <Link href="/settings" className={styles.backLink}>← Configuración</Link>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Avisos de seguimiento</h1>
          <p className={styles.subtitle}>
            Te mandamos un mensaje a tu sistema cada vez que un pedido avanza o el repartidor se mueve.
          </p>
        </div>
        {settings ? (
          <p className={styles.status}>
            <span className={`${styles.dot} ${live ? styles.dotOn : ''}`} aria-hidden />
            {live ? 'Enviando avisos' : 'Pausado'}
          </p>
        ) : null}
      </header>

      {loading ? <p className={styles.loading}>Cargando…</p> : null}
      {error ? <div className={`${styles.banner} ${styles.bannerErr}`} role="alert">{error}</div> : null}
      {note ? <div className={`${styles.banner} ${styles.bannerOk}`} role="status">{note}</div> : null}

      {settings ? (
        <>
          <section className={styles.panel}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="webhook-url">Dirección donde llegan los avisos</label>
              <p className={styles.hint}>
                Pega la de tu sistema, o pulsa Probar ahora para usar una dirección de prueba de Venddelo.
              </p>
              <input
                id="webhook-url"
                className={styles.input}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://tu-sitio.com/avisos"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <div className={styles.saveRow}>
              <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void tryNow()}>
                {busy ? 'Un momento…' : 'Probar ahora'}
              </button>
              <button type="button" className={styles.secondaryBtn} disabled={busy || !webhookUrl.trim()} onClick={() => void onSaveCustom()}>
                Guardar dirección
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={busy || !settings.webhook.is_enabled}
                onClick={() => void onTest()}
              >
                Enviar un aviso de prueba
              </button>
              <a className={styles.linkBtn} href={settings.test_sink.events_url} target="_blank" rel="noopener noreferrer">
                Ver avisos de prueba
              </a>
            </div>

            <div className={styles.toggles}>
              <div className={styles.row}>
                <div className={styles.rowText}>
                  <div className={styles.rowTitle}>Avisos de estado</div>
                  <div className={styles.rowHint}>Asignado, en camino, entregado…</div>
                </div>
                <Toggle
                  ariaLabel="Avisos de estado"
                  checked={settings.webhook.notify_status}
                  disabled={busy}
                  onChange={(next) => void onToggle({ notify_status: next })}
                />
              </div>
              <div className={styles.row}>
                <div className={styles.rowText}>
                  <div className={styles.rowTitle}>Ubicación del repartidor</div>
                  <div className={styles.rowHint}>Cada 5 segundos por pedido en curso</div>
                </div>
                <Toggle
                  ariaLabel="Ubicación del repartidor"
                  checked={settings.webhook.notify_location}
                  disabled={busy}
                  onChange={(next) => void onToggle({ notify_location: next })}
                />
              </div>
              <div className={styles.row}>
                <div className={styles.rowText}>
                  <div className={styles.rowTitle}>Enviar avisos</div>
                  <div className={styles.rowHint}>Apágalo para pausar sin borrar nada</div>
                </div>
                <Toggle
                  ariaLabel="Enviar avisos"
                  checked={settings.webhook.is_enabled}
                  disabled={busy}
                  onChange={(next) => void onToggle({ is_enabled: next })}
                />
              </div>
            </div>

            <div className={styles.secretRow}>
              <p className={styles.hint}>
                {settings.webhook.has_signing_secret
                  ? `Clave de seguridad activa ${settings.webhook.secret_hint ?? ''}`
                  : 'Todavía no hay clave de seguridad.'}
              </p>
              <button type="button" className={styles.textBtn} disabled={busy} onClick={() => void onNewSecret()}>
                {settings.webhook.has_signing_secret ? 'Cambiar clave' : 'Crear clave'}
              </button>
            </div>
            {secretOnce ? (
              <div className={styles.bannerWarn}>
                <p className={styles.hint}>Cópiala ahora. No se vuelve a mostrar.</p>
                <div className={styles.secret}>{secretOnce}</div>
                <button type="button" className={styles.textBtn} onClick={() => void copySecret()}>
                  Copiar clave
                </button>
              </div>
            ) : null}
          </section>

          <details className={styles.details}>
            <summary>Para quien programa la integración</summary>
            <div className={styles.detailsBody}>
              Recibes un POST JSON. La cabecera <code>X-Venddelo-Signature</code> es un HMAC-SHA256 de
              <code> timestamp.raw_body</code> con tu clave <code>whsec_…</code>. En cambios de estado
              va el detalle del pedido en <code>data.tracking</code>.
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
