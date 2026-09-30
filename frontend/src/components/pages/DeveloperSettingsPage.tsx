'use client';

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

function Switch({
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
      <span className={styles.slider} aria-hidden="true" />
    </label>
  );
}

function SettingToggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        <div className={styles.toggleHint}>{hint}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} ariaLabel={label} />
    </div>
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
        <p className={styles.lead}>Solo el dueño o un administrador puede usar Developer.</p>
      </div>
    );
  }

  const live = Boolean(settings?.webhook.is_enabled && settings.webhook.url);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Developer</p>
          <h1 className={styles.title}>Webhooks</h1>
          <p className={styles.lead}>
            Venddelo hace un POST a tu servidor por cada pedido. Si hay varios a la vez, llega un
            aviso distinto por cada uno: míralos por <code>request_id</code>.
          </p>
        </div>
        <p className={styles.status}>
          <span className={`${styles.dot} ${live ? styles.dotOn : ''}`} aria-hidden />
          {live ? 'live' : 'paused'}
        </p>
      </header>

      {loading ? <p className={styles.lead}>Cargando…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {note ? <p className={styles.ok} role="status">{note}</p> : null}

      {settings ? (
        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="dev-endpoint">
            <h2 id="dev-endpoint" className={styles.cardTitle}>Endpoint</h2>
            <p className={styles.cardText}>
              Pega la URL de tu API. Si todavía no tienes una, Probar ahora usa un receptor de
              Venddelo y deja los eventos listos para abrirlos.
            </p>
            <label className={styles.label} htmlFor="webhook-url">POST URL</label>
            <input
              id="webhook-url"
              className={styles.input}
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://api.tu-dominio.com/venddelo"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy || !settings} onClick={() => void tryNow()}>
                {busy ? 'Enviando…' : 'Probar ahora'}
              </button>
              <button type="button" className={styles.ghost} disabled={busy || !webhookUrl.trim()} onClick={() => void onSaveCustom()}>
                Guardar URL
              </button>
              <a className={styles.ghost} href={settings.test_sink.events_url} target="_blank" rel="noopener noreferrer">
                Ver eventos
              </a>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="dev-events">
            <h2 id="dev-events" className={styles.cardTitle}>Eventos</h2>
            <p className={styles.cardText}>
              Elige qué llega. La ubicación sale al ritmo del repartidor, cerca de cada 5 segundos,
              solo mientras el pedido está en curso.
            </p>
            <SettingToggle
              label="tracking.status_changed"
              hint="Asignado, recogido, en camino, entregado"
              checked={settings.webhook.notify_status}
              disabled={busy}
              onChange={(next) => void onToggle({ notify_status: next })}
            />
            <SettingToggle
              label="tracking.location_updated"
              hint="Latitud y longitud de ese pedido"
              checked={settings.webhook.notify_location}
              disabled={busy}
              onChange={(next) => void onToggle({ notify_location: next })}
            />
            <SettingToggle
              label="Webhook activo"
              hint="Pausa el envío sin borrar la URL ni la clave"
              checked={settings.webhook.is_enabled}
              disabled={busy}
              onChange={(next) => void onToggle({ is_enabled: next })}
            />
          </section>

          <section className={styles.card} aria-labelledby="dev-sign">
            <h2 id="dev-sign" className={styles.cardTitle}>Firma</h2>
            <p className={styles.cardText}>
              Cada POST trae <code>X-Venddelo-Signature</code>. Compárala con un HMAC-SHA256 de
              <code> timestamp + &quot;.&quot; + cuerpo</code> usando tu clave <code>whsec_</code>.
              {settings.webhook.has_signing_secret
                ? ` Activa ${settings.webhook.secret_hint ?? ''}.`
                : ' Todavía no hay clave.'}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => void onNewSecret()}>
                {settings.webhook.has_signing_secret ? 'Rotar clave' : 'Crear clave'}
              </button>
              <button
                type="button"
                className={styles.ghost}
                disabled={busy || !settings.webhook.is_enabled}
                onClick={() => void onTest()}
              >
                Enviar evento de prueba
              </button>
            </div>
            {secretOnce ? (
              <div className={styles.secretBox}>
                <p>Cópiala ahora. No se vuelve a mostrar.</p>
                <code>{secretOnce}</code>
                <button type="button" className={styles.ghost} onClick={() => void copySecret()}>
                  Copiar
                </button>
              </div>
            ) : null}
          </section>

          <section className={styles.console} aria-labelledby="dev-sample">
            <div className={styles.consoleBar}>
              <h2 id="dev-sample">Ejemplo</h2>
              <span>application/json</span>
            </div>
            <pre>{`{
  "type": "tracking.status_changed",
  "data": {
    "request_id": "…",
    "tracking_token": "…",
    "tracking": { "status": "in_transit" }
  }
}`}</pre>
            <p>
              <code>tracking.location_updated</code> trae latitud y longitud, sin el objeto completo.
              Varios pedidos del mismo repartidor comparten coordenadas y se distinguen por{' '}
              <code>request_id</code>.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
