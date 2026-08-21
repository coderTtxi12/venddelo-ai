'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DispatchRequestSuccess } from '@/components/dispatch/DispatchRequestSuccess';
import { RequestDeliveryForm } from '@/components/dispatch/RequestDeliveryForm';
import { updateRestaurantOrderStatus } from '@/lib/api/orders';
import { listDispatchLeadTimes, type DispatchRequest } from '@/lib/api/dispatch';
import { getPublicCheckoutConfig } from '@/lib/api/public';
import { ApiError } from '@/lib/api/types';
import type { Order } from '@/lib/api/types';
import { getRestaurant } from '@/lib/api/restaurants';
import { isActiveDeliveryPartnership } from '@/lib/fetchActiveDeliveryProviderConfig';
import {
  kitchenConfirmOpensDispatch,
  orderToDispatchFormValues,
  requestRiderThenConfirmOrder,
} from '@/lib/orders/kitchenDispatch';
import { formatOrderDisplayId } from '@/lib/orders/orderDisplay';
import { syncRestaurantDeliveryPartnership } from '@/lib/syncDeliveryPartnership';
import styles from './OrderDispatchDrawer.module.css';

type CachedDispatchState = {
  request: DispatchRequest;
  confirmError: string | null;
};

function confirmFailureMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'El repartidor ya se solicitó, pero no se pudo confirmar el pedido.';
}

export function OrderDispatchDrawer({
  open,
  order,
  accessToken,
  restaurantId,
  onClose,
  onOrderConfirmed,
}: {
  open: boolean;
  order: Order | null;
  accessToken: string;
  restaurantId: string;
  onClose: () => void;
  onOrderConfirmed: (order: Order) => void;
}) {
  const createdByOrderIdRef = useRef<Map<string, CachedDispatchState>>(new Map());
  const [subdomain, setSubdomain] = useState('');
  const [leadTimes, setLeadTimes] = useState<number[]>([]);
  const [courierAvailable, setCourierAvailable] = useState(false);
  const [courierReason, setCourierReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [created, setCreated] = useState<DispatchRequest | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initialValues = useMemo(
    () => (order && kitchenConfirmOpensDispatch(order) ? orderToDispatchFormValues(order) : null),
    [order],
  );

  const tryClose = useCallback(() => {
    if (submitting || confirming) return;
    onClose();
  }, [confirming, onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') tryClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, tryClose]);

  useEffect(() => {
    if (!order?.id) {
      setCreated(null);
      setConfirmError(null);
      return;
    }
    const cached = createdByOrderIdRef.current.get(order.id);
    setCreated(cached?.request ?? null);
    setConfirmError(cached?.confirmError ?? null);
  }, [order?.id]);

  const cacheCreatedState = useCallback(
    (orderId: string, request: DispatchRequest, nextConfirmError: string | null) => {
      createdByOrderIdRef.current.set(orderId, { request, confirmError: nextConfirmError });
      setCreated(request);
      setConfirmError(nextConfirmError);
    },
    [],
  );

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const restaurant = await getRestaurant(accessToken, restaurantId);
      const partnership = await syncRestaurantDeliveryPartnership(
        accessToken,
        restaurantId,
        restaurant.delivery_enabled,
      );
      if (!isActiveDeliveryPartnership(partnership)) {
        setCourierAvailable(false);
        setCourierReason('No tienes un repartidor activo');
        setSubdomain(restaurant.subdomain);
        setLeadTimes([]);
        return;
      }
      const [times, checkoutConfig] = await Promise.all([
        listDispatchLeadTimes(accessToken, restaurantId),
        getPublicCheckoutConfig(restaurant.subdomain),
      ]);
      setSubdomain(restaurant.subdomain);
      setLeadTimes(times.map((item) => item.prep_minutes));
      setCourierAvailable(checkoutConfig.delivery_service?.available ?? false);
      setCourierReason(checkoutConfig.delivery_service?.reason ?? null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'No se pudo cargar Delivery.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, restaurantId]);

  useEffect(() => {
    if (!open) return;
    void loadSetup();
  }, [open, loadSetup]);

  const confirmOrder = useCallback(async () => {
    if (!order) throw new Error('Pedido no disponible');
    return updateRestaurantOrderStatus(accessToken, restaurantId, order.id, 'confirmed');
  }, [accessToken, order, restaurantId]);

  const handleCreated = useCallback(
    async (request: DispatchRequest) => {
      if (!order) return;
      const result = await requestRiderThenConfirmOrder({
        createDispatch: async () => request,
        confirmOrder,
      });
      if (result.status === 'ok') {
        onOrderConfirmed(result.order);
        cacheCreatedState(order.id, result.request, null);
        return;
      }
      if (result.status === 'confirm_failed') {
        cacheCreatedState(order.id, result.request, confirmFailureMessage(result.error));
      }
    },
    [cacheCreatedState, confirmOrder, onOrderConfirmed, order],
  );

  async function retryConfirm() {
    if (!order || !created) return;
    setConfirming(true);
    try {
      const updated = await confirmOrder();
      onOrderConfirmed(updated);
      cacheCreatedState(order.id, created, null);
    } catch (error) {
      const message = confirmFailureMessage(error);
      setConfirmError(message);
      createdByOrderIdRef.current.set(order.id, { request: created, confirmError: message });
    } finally {
      setConfirming(false);
    }
  }

  if (!open || !order) return null;

  return (
    <div className={styles.backdrop} onClick={tryClose} role="presentation">
      <div
        key={order.id}
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Solicitar delivery pedido ${formatOrderDisplayId(order)}`}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Solicitar delivery · #{formatOrderDisplayId(order)}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={tryClose}
            disabled={submitting || confirming}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          {loading ? <p className={styles.loading}>Cargando Delivery…</p> : null}
          {loadError ? <p className={styles.retryText}>{loadError}</p> : null}
          {created && subdomain ? (
            <>
              {confirmError ? (
                <div className={styles.retry}>
                  <p className={styles.retryText}>{confirmError}</p>
                  <button type="button" className={styles.retryBtn} disabled={confirming} onClick={() => void retryConfirm()}>
                    {confirming ? 'Confirmando…' : 'Reintentar confirmar pedido'}
                  </button>
                </div>
              ) : null}
              <DispatchRequestSuccess
                key={created.short_id}
                request={created}
                subdomain={subdomain}
                onDismiss={tryClose}
              />
            </>
          ) : !loading && subdomain ? (
            <RequestDeliveryForm
              accessToken={accessToken}
              restaurantId={restaurantId}
              subdomain={subdomain}
              courierAvailable={courierAvailable}
              courierReason={courierReason}
              leadTimes={leadTimes}
              initialValues={initialValues}
              submitLabel="Continuar y solicitar repartidor"
              resetOnSuccess={false}
              onSubmittingChange={setSubmitting}
              onCreated={handleCreated}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
