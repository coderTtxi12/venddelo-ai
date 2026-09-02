'use client';

import { useEffect, useRef, useState } from 'react';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import type { Order } from '@/lib/api/types';
import { getRestaurantOrder } from '@/lib/api/orders';
import { ApiError } from '@/lib/api/types';
import { createClient } from '@/lib/supabase/client';
import { formatOrderDateTime } from '@/lib/orders/orderDisplay';
import { CouponOrderDetail } from '@/components/coupons/CouponOrderDetail';
import styles from './CustomerDetailDrawer.module.css';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CustomerMenuOrderDetailProps = {
  accessToken: string;
  restaurantId: string;
  orderId: string;
  displayId: string;
  customerName: string;
  createdAt: string;
  onBack: () => void;
};

async function fetchOrderWithFreshToken(
  accessToken: string,
  restaurantId: string,
  orderId: string,
): Promise<Order> {
  try {
    return await getRestaurantOrder(accessToken, restaurantId, orderId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    const { data } = await createClient().auth.getSession();
    const freshToken = data.session?.access_token;
    if (!freshToken || freshToken === accessToken) {
      throw error;
    }
    return getRestaurantOrder(freshToken, restaurantId, orderId);
  }
}

export function CustomerMenuOrderDetail({
  accessToken,
  restaurantId,
  orderId,
  displayId,
  customerName,
  createdAt,
  onBack,
}: CustomerMenuOrderDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!accessToken || !restaurantId || !orderId) {
      setOrder(null);
      setError('No hay sesión activa para cargar el pedido.');
      setLoading(false);
      return;
    }

    if (!UUID_RE.test(orderId)) {
      setOrder(null);
      setError('Este pedido no tiene un identificador válido para abrir el detalle.');
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setOrder(null);

    void fetchOrderWithFreshToken(accessToken, restaurantId, orderId)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setOrder(result);
      })
      .catch((loadError) => {
        if (requestId !== requestIdRef.current) return;
        console.error('Customer order detail failed', loadError);
        if (loadError instanceof ApiError) {
          setError(loadError.message);
          return;
        }
        setError('No se pudo cargar el detalle del pedido.');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [accessToken, orderId, restaurantId]);

  return (
    <div className={styles.orderDetailShell}>
      <div className={styles.orderDetailNav}>
        <button
          type="button"
          className={styles.orderDetailBack}
          aria-label="Volver al historial"
          onClick={onBack}
        >
          <ArrowBackOutlinedIcon sx={{ fontSize: 18 }} />
        </button>
        <div className={styles.orderDetailHeading}>
          <h3 className={styles.orderDetailTitle}>Pedido #{displayId}</h3>
          <p className={styles.orderDetailSub}>
            {customerName} · {formatOrderDateTime(createdAt)}
          </p>
        </div>
      </div>
      <CouponOrderDetail
        order={order}
        loading={loading}
        error={error}
        customerName={customerName}
      />
    </div>
  );
}
