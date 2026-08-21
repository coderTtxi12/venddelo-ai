'use client';

import DeliveryDiningOutlinedIcon from '@mui/icons-material/DeliveryDiningOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DispatchRecentRequests } from '@/components/dispatch/DispatchRecentRequests';
import { DispatchRequestSuccess } from '@/components/dispatch/DispatchRequestSuccess';
import { RequestDeliveryForm } from '@/components/dispatch/RequestDeliveryForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { useAuth } from '@/hooks/useAuth';
import {
  cancelDispatchRequest,
  confirmDispatchCash,
  listDispatchLeadTimes,
  listDispatchRequests,
  retryDispatchRequest,
  type DispatchRequest,
  formatDispatchShortId,
  isDispatchHistoryStatus,
} from '@/lib/api/dispatch';
import { getPublicCheckoutConfig, type PublicDeliveryService } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
import { formatMoney } from '@/lib/currency';
import {
  useRestaurantDispatchEvents,
  type RestaurantDispatchStreamStatus,
} from '@/lib/dispatch/useRestaurantDispatchEvents';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import styles from './DeliveryPage.module.css';

const LIVE_COPY: Record<
  RestaurantDispatchStreamStatus,
  { label: string; hint: string; tone: 'live' | 'pending' | 'muted' }
> = {
  live: {
    label: 'En vivo',
    hint: 'Las solicitudes se actualizan automáticamente',
    tone: 'live',
  },
  connecting: {
    label: 'Conectando',
    hint: 'Estableciendo enlace en tiempo real',
    tone: 'pending',
  },
  reconnecting: {
    label: 'Reconectando',
    hint: 'Sincronizando solicitudes al restablecer la conexión',
    tone: 'pending',
  },
  offline: {
    label: 'Sin enlace',
    hint: 'No hay conexión en tiempo real',
    tone: 'muted',
  },
};

export default function DeliveryPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();
  const [subdomain, setSubdomain] = useState('');
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [leadTimes, setLeadTimes] = useState<number[]>([]);
  const [deliveryService, setDeliveryService] = useState<PublicDeliveryService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DispatchRequest | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'cancel' | 'cash';
    request: DispatchRequest;
    step: 1 | 2;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [formExpanded, setFormExpanded] = useState(true);
  const [socketStatus, setSocketStatus] = useState<RestaurantDispatchStreamStatus>('offline');
  const [listView, setListView] = useState<'active' | 'history'>('active');
  const didInitFormCollapse = useRef(false);

  const courierAvailable = deliveryService?.available ?? false;
  const courierReason = deliveryService?.reason ?? null;

  const load = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const restaurant = await getRestaurant(accessToken, selectedRestaurantId);
      const partnership = await syncRestaurantDeliveryPartnership(
        accessToken,
        selectedRestaurantId,
        restaurant.delivery_enabled,
      );
      if (!isActiveDeliveryPartnership(partnership)) {
        setError('No tienes un repartidor activo');
        setRequests([]);
        setLeadTimes([]);
        setDeliveryService(null);
        return;
      }

      const [rows, times, checkoutConfig] = await Promise.all([
        listDispatchRequests(accessToken, selectedRestaurantId),
        listDispatchLeadTimes(accessToken, selectedRestaurantId),
        getPublicCheckoutConfig(restaurant.subdomain),
      ]);

      const minutes = times.map((item) => item.prep_minutes);
      setSubdomain(restaurant.subdomain);
      setRequests(rows);
      setLeadTimes(minutes);
      setDeliveryService(checkoutConfig.delivery_service);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'No se pudo cargar Delivery.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRestaurantId]);

  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  const refreshRequests = useCallback(async () => {
    if (!accessToken || !selectedRestaurantId) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      do {
        refreshQueuedRef.current = false;
        const rows = await listDispatchRequests(accessToken, selectedRestaurantId);
        setRequests(rows);
        setCreated((current) => {
          if (!current) return current;
          return rows.find((item) => item.id === current.id) ?? current;
        });
      } while (refreshQueuedRef.current);
    } catch {
      /* keep the current list until the next successful refresh */
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [accessToken, selectedRestaurantId]);

  const { visibilityState } = useRestaurantDispatchEvents(selectedRestaurantId, accessToken, {
    onEvent: () => {
      void refreshRequests();
    },
    onStatusChange: setSocketStatus,
    onReconnect: () => {
      void refreshRequests();
    },
  });

  // Fallback poll only when the tab is visible and SSE is not live.
  useEffect(() => {
    if (!accessToken || !selectedRestaurantId) return;
    if (visibilityState !== 'visible') return;
    if (socketStatus === 'live') return;
    const timer = window.setInterval(() => {
      void refreshRequests();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [accessToken, refreshRequests, selectedRestaurantId, socketStatus, visibilityState]);

  useEffect(() => {
    if (loading || didInitFormCollapse.current) return;
    if (requests.length > 0) {
      setFormExpanded(false);
      didInitFormCollapse.current = true;
    }
  }, [loading, requests.length]);

  useEffect(() => {
    if (authLoading || accessLoading) return;
    if (!accessToken || !selectedRestaurantId) return;
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [accessLoading, accessToken, authLoading, load, selectedRestaurantId]);

  const activeRequests = useMemo(
    () => requests.filter((item) => !isDispatchHistoryStatus(item.status)),
    [requests],
  );
  const historyRequests = useMemo(
    () => requests.filter((item) => isDispatchHistoryStatus(item.status)),
    [requests],
  );
  const liveCopy = LIVE_COPY[socketStatus];
  const liveDotClass =
    liveCopy.tone === 'live'
      ? styles.liveDotLive
      : liveCopy.tone === 'pending'
        ? styles.liveDotPending
        : styles.liveDotMuted;

  const formSummary = 'Nombre, celular y dirección del cliente';

  async function runAction(
    request: DispatchRequest,
    action: 'retry' | 'cancel' | 'cash',
  ): Promise<boolean> {
    if (!accessToken || !selectedRestaurantId) return false;
    setError(null);
    try {
      const updated =
        action === 'cancel'
          ? await cancelDispatchRequest(accessToken, selectedRestaurantId, request.id)
          : action === 'retry'
            ? await retryDispatchRequest(accessToken, selectedRestaurantId, request.id)
            : await confirmDispatchCash(accessToken, selectedRestaurantId, request.id);
      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setCreated((current) =>
        current && current.id === updated.id ? updated : current,
      );
      return true;
    } catch (actionError) {
      setError(
        actionError instanceof ApiError ? actionError.message : 'No se pudo actualizar la solicitud.',
      );
      return false;
    }
  }

  async function finishConfirm() {
    if (!confirm) return;
    setConfirming(true);
    try {
      const ok = await runAction(confirm.request, confirm.kind);
      if (ok) setConfirm(null);
    } finally {
      setConfirming(false);
    }
  }

  const confirmCopy = confirm
    ? confirm.kind === 'cancel'
      ? confirm.step === 1
        ? {
            title: `¿Cancelar el envío ${formatDispatchShortId(confirm.request.short_id)}?`,
            description:
              'Se detendrá la búsqueda de repartidor y el cliente dejará de ver el rastreo activo.\n\nEsta acción no se puede deshacer.',
            confirmLabel: 'Continuar',
            cancelLabel: 'No, conservar',
            variant: 'danger' as const,
          }
        : {
            title: 'Confirma la cancelación',
            description: `Vas a cancelar ${formatDispatchShortId(confirm.request.short_id)} de ${confirm.request.customer_name}. El pedido no se asignará a ningún rider.`,
            confirmLabel: 'Sí, cancelar envío',
            cancelLabel: 'Volver',
            variant: 'danger' as const,
          }
      : confirm.step === 1
        ? {
            title: '¿El rider ya te pagó?',
            description:
              'Esto libera el crédito retenido al repartidor.\n\nConfírmalo solo si ya recibiste el efectivo en tu negocio.',
            confirmLabel: 'Continuar',
            cancelLabel: 'Todavía no',
            variant: 'primary' as const,
          }
        : {
            title: 'Confirma el pago',
            description: `Vas a marcar que el rider ya te entregó el cobro de ${formatDispatchShortId(confirm.request.short_id)} (${formatMoney(confirm.request.collect_cents / 100, 'MXN')}).`,
            confirmLabel: 'Sí, ya me pagó',
            cancelLabel: 'Volver',
            variant: 'primary' as const,
          }
    : null;

  if (loading || authLoading || accessLoading) {
    return <p className={styles.loading}>Cargando Delivery…</p>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Delivery</h1>
          <p>Solicita un repartidor para una entrega creada fuera del menú digital.</p>
        </div>
        <div
          className={styles.liveIndicator}
          role="status"
          aria-live="polite"
          aria-label={`${liveCopy.label}. ${liveCopy.hint}`}
          title={liveCopy.hint}
        >
          <span className={`${styles.liveDot} ${liveDotClass}`} aria-hidden />
          <span className={styles.liveLabel}>{liveCopy.label}</span>
        </div>
      </header>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {!courierAvailable ? (
        <div className={styles.serviceAlert} role="alert">
          {courierReason ?? 'El servicio de reparto de Mexy no está disponible en este momento.'}
        </div>
      ) : null}

      <section
        className={`${styles.formSection} ${formExpanded ? styles.formSectionOpen : ''}`}
        aria-labelledby="new-delivery-title"
      >
        <button
          type="button"
          className={styles.formToggle}
          aria-expanded={formExpanded}
          aria-controls="new-delivery-panel"
          onClick={() => setFormExpanded((open) => !open)}
        >
          <span className={styles.formToggleLead}>
            <DeliveryDiningOutlinedIcon className={styles.formToggleIcon} aria-hidden />
            <span className={styles.formToggleMain}>
              <h2 id="new-delivery-title" className={styles.formTitle}>
                Solicitar delivery
              </h2>
              {!formExpanded ? (
                <span className={styles.formSummary}>{formSummary}</span>
              ) : null}
            </span>
          </span>
          <span
            className={`${styles.formChevron} ${formExpanded ? styles.formChevronExpanded : ''}`}
            aria-hidden
          >
            <ExpandMoreOutlinedIcon sx={{ fontSize: 22 }} />
          </span>
        </button>

        <div id="new-delivery-panel" className={styles.formPanel} hidden={!formExpanded}>
          <p className={styles.formSubtitle}>
            Completa los datos del cliente, cobro y paquete.
          </p>
          {accessToken && selectedRestaurantId ? (
            <RequestDeliveryForm
              accessToken={accessToken}
              restaurantId={selectedRestaurantId}
              subdomain={subdomain}
              courierAvailable={courierAvailable}
              courierReason={courierReason}
              leadTimes={leadTimes}
              submitLabel="Solicitar repartidor"
              resetOnSuccess
              onCreated={(row) => {
                setCreated(row);
                setRequests((current) => [row, ...current]);
                setFormExpanded(false);
              }}
            />
          ) : null}
        </div>
      </section>

      {created && subdomain ? (
        <DispatchRequestSuccess
          key={created.short_id}
          request={created}
          subdomain={subdomain}
          onDismiss={() => setCreated(null)}
        />
      ) : null}

      <div className={styles.listTabs} role="tablist" aria-label="Solicitudes de delivery">
        <button
          type="button"
          role="tab"
          id="delivery-tab-active"
          aria-selected={listView === 'active'}
          aria-controls="delivery-panel-active"
          className={`${styles.listTab} ${listView === 'active' ? styles.listTabActive : ''}`}
          onClick={() => setListView('active')}
        >
          Activos
          <span className={styles.listTabCount}>{activeRequests.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="delivery-tab-history"
          aria-selected={listView === 'history'}
          aria-controls="delivery-panel-history"
          className={`${styles.listTab} ${listView === 'history' ? styles.listTabActive : ''}`}
          onClick={() => setListView('history')}
        >
          Historial
          <span className={styles.listTabCount}>{historyRequests.length}</span>
        </button>
      </div>

      <div
        id={listView === 'active' ? 'delivery-panel-active' : 'delivery-panel-history'}
        role="tabpanel"
        aria-labelledby={listView === 'active' ? 'delivery-tab-active' : 'delivery-tab-history'}
      >
        <DispatchRecentRequests
          key={listView}
          variant={listView}
          requests={listView === 'active' ? activeRequests : historyRequests}
          subdomain={subdomain}
          busy={confirming}
          onRetry={(request) => void runAction(request, 'retry')}
          onCancel={(request) => setConfirm({ kind: 'cancel', request, step: 1 })}
          onConfirmCash={(request) => setConfirm({ kind: 'cash', request, step: 1 })}
        />
      </div>
      <ConfirmDialog
        open={confirm != null && confirmCopy != null}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description ?? ''}
        stepHint={confirm ? `Paso ${confirm.step} de 2` : undefined}
        confirmLabel={confirmCopy?.confirmLabel}
        cancelLabel={confirmCopy?.cancelLabel}
        variant={confirmCopy?.variant}
        loading={confirming}
        onCancel={() => {
          if (confirming) return;
          if (confirm?.step === 2) {
            setConfirm({ ...confirm, step: 1 });
            return;
          }
          setConfirm(null);
        }}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.step === 1) {
            setConfirm({ ...confirm, step: 2 });
            return;
          }
          void finishConfirm();
        }}
      />
    </div>
  );
}
