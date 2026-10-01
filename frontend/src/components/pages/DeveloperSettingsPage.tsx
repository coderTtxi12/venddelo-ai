'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import {
  getDeveloperSettings,
  rotateDeveloperWebhookSecret,
  listDeveloperWebhookEvents,
  listJustoReceipts,
  testDeveloperWebhook,
  updateDeveloperWebhook,
  type DeveloperSettings,
  type DeveloperWebhook,
} from '@/lib/api/developer';
import { ApiError } from '@/lib/api/types';
import styles from '@/components/settings/DeveloperSettingsPanel.module.css';

function displayWebhookUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '';
  } catch {
    return '';
  }
  return url;
}

const TRACKING_STATUSES: { code: string; meaning: string }[] = [
  { code: 'accepted', meaning: 'El pedido ya existe, pero el restaurante todavía no lo confirma.' },
  { code: 'scheduled', meaning: 'El restaurante lo aceptó y lo está preparando. Aún no hay repartidor.' },
  { code: 'searching', meaning: 'Ya se busca un repartidor disponible.' },
  { code: 'offered', meaning: 'Un repartidor tiene la oferta y puede aceptarla o rechazarla.' },
  { code: 'assigned', meaning: 'Un repartidor aceptó y va hacia el restaurante. Aquí empieza la ubicación.' },
  { code: 'picked_up', meaning: 'El repartidor está en el restaurante recogiendo el pedido.' },
  { code: 'in_transit', meaning: 'Ya salió y va hacia el cliente.' },
  { code: 'delivered', meaning: 'El pedido se entregó.' },
  { code: 'unassigned', meaning: 'No se encontró repartidor. El restaurante puede volver a buscar.' },
  { code: 'cancelled', meaning: 'La entrega se canceló.' },
];

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
  const [sentEvents, setSentEvents] = useState<string | null>(null);
  const [justoReceipt, setJustoReceipt] = useState<string | null>(null);

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
      setWebhookUrl(displayWebhookUrl(data.webhook.url));
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
    setWebhookUrl(displayWebhookUrl(webhook.url));
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

  const onViewEvents = async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await listDeveloperWebhookEvents(accessToken, selectedRestaurantId);
      setSentEvents(JSON.stringify(data, null, 2));
      if (data.items.length === 0) {
        setNote('Todavía no hay avisos enviados.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los avisos');
    } finally {
      setBusy(false);
    }
  };

  const copyJustoUrl = async () => {
    const url = settings?.justo?.inbound_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNote('URL de Justo copiada.');
    } catch {
      setError('No se pudo copiar. Selecciónala a mano.');
    }
  };

  const onViewJustoReceipt = async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await listJustoReceipts(accessToken, selectedRestaurantId);
      setJustoReceipt(JSON.stringify(data, null, 2));
      if (data.items.length === 0) {
        setNote('Justo todavía no ha enviado un aviso a esta dirección.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el aviso de Justo');
    } finally {
      setBusy(false);
    }
  };

  const copyJustoSecret = async () => {
    const secret = settings?.justo?.signing_secret;
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setNote('Llave de Justo copiada.');
    } catch {
      setError('No se pudo copiar. Selecciónala a mano.');
    }
  };

  const onSaveCustom = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await saveUrl(webhookUrl);
      setNote('Dirección guardada.');
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

  const live = Boolean(settings?.webhook.is_enabled && displayWebhookUrl(settings.webhook.url));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Developer</p>
          <h1 className={styles.title}>Webhooks</h1>
          <p className={styles.lead}>
            Cada pedido envía un aviso a la dirección que guardes. Si hay varios al mismo tiempo,
            llega uno por pedido. El campo <code>request_id</code> los distingue.
          </p>
        </div>
        <p className={styles.status}>
          <span className={`${styles.dot} ${live ? styles.dotOn : ''}`} aria-hidden />
          {live ? 'Activo' : 'Pausado'}
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
              Pega la dirección de tu servidor. Mexy enviará ahí eventos por cada pedido.
            </p>
            <label className={styles.label} htmlFor="webhook-url">Dirección del webhook</label>
            <input
              id="webhook-url"
              className={styles.input}
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://tu-servidor.com/webhooks/mexy"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy || !webhookUrl.trim()} onClick={() => void onSaveCustom()}>
                Guardar dirección
              </button>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => void onViewEvents()}>
                Ver eventos
              </button>
            </div>
            {sentEvents ? <pre className={styles.eventsPreview}>{sentEvents}</pre> : null}
          </section>

          <section className={styles.card} aria-labelledby="dev-justo">
            <h2 id="dev-justo" className={styles.cardTitle}>Pedidos de Justo</h2>
            <p className={styles.cardText}>
              En Justo pega la URL y la llave secreta. El tipo de evento es el de pedido creado,
              no <code>orderStatusUpdated</code>. Marca Activar. Llegan los pedidos a domicilio del
              propio Justo y los de Uber exclusivo, los que entrega el restaurante.
            </p>
            {settings.justo?.inbound_url ? (
              <div className={styles.secretBox}>
                <p>URL</p>
                <code>{settings.justo.inbound_url}</code>
                <button type="button" className={styles.ghost} onClick={() => void copyJustoUrl()}>
                  Copiar URL
                </button>
              </div>
            ) : null}
            {settings.justo?.signing_secret ? (
              <div className={styles.secretBox}>
                <p>Llave secreta. Pégala tal cual en Justo.</p>
                <code>{settings.justo.signing_secret}</code>
                <button type="button" className={styles.ghost} onClick={() => void copyJustoSecret()}>
                  Copiar llave
                </button>
              </div>
            ) : null}
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => void onViewJustoReceipt()}>
                Ver aviso de Justo
              </button>
            </div>
            {justoReceipt ? <pre className={styles.eventsPreview}>{justoReceipt}</pre> : null}
          </section>

          <section className={styles.card} aria-labelledby="dev-events">
            <h2 id="dev-events" className={styles.cardTitle}>Eventos</h2>
            <p className={styles.cardText}>
              Elige qué avisos quieres. La ubicación se envía cerca de cada 5 segundos, y solo
              mientras el repartidor lleva el pedido.
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
              Cada aviso incluye la cabecera <code>X-Venddelo-Signature</code>. Para comprobar que
              viene de Venddelo, calcula un HMAC-SHA256 de <code>timestamp.raw_body</code> con tu
              clave <code>whsec_</code>.
              {settings.webhook.has_signing_secret
                ? ` Ya tienes una clave ${settings.webhook.secret_hint ?? ''}.`
                : ' Aún no hay clave. Créala antes de activar el webhook.'}
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

          <section className={styles.card} aria-labelledby="dev-statuses">
            <h2 id="dev-statuses" className={styles.cardTitle}>Estados</h2>
            <p className={styles.cardText}>
              En <code>tracking.status_changed</code> mira <code>data.tracking.status</code>.
              En <code>tracking.location_updated</code> el mismo valor va en <code>data.status</code>,
              y solo llega con repartidor en curso: <code>assigned</code>, <code>picked_up</code> o{' '}
              <code>in_transit</code>.
            </p>
            <ul className={styles.statusList}>
              {TRACKING_STATUSES.map((item) => (
                <li key={item.code}>
                  <code>{item.code}</code>
                  <span>{item.meaning}</span>
                </li>
              ))}
            </ul>
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
