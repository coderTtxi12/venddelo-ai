"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccessToken } from "@/hooks/use-access-token";
import { listOrders, updateOrderStatus } from "@/lib/api/orders";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
};

const STATUS_TONE: Record<string, "neutral" | "warning" | "brand" | "success"> = {
  pending: "warning",
  confirmed: "brand",
  preparing: "brand",
  ready: "success",
  delivered: "neutral",
};

export default function OrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const token = useAccessToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["orders", restaurantId, token],
    enabled: !!token,
    queryFn: () => listOrders(token!, restaurantId),
    refetchInterval: 10_000,
  });

  async function advance(orderId: string, current: string) {
    if (!token) return;
    const next = NEXT_STATUS[current];
    if (!next) return;
    await updateOrderStatus(token, restaurantId, orderId, next);
    qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
  }

  const orders = data?.items ?? [];
  const todayTotal = orders.reduce((s, o) => s + o.total_cents, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Pedidos"
        description={`Actualización automática cada 10s · Total listado: ${formatMoney(todayTotal)}`}
      />

      {isLoading && <Card>Cargando…</Card>}

      {!isLoading && orders.length === 0 && (
        <EmptyState
          title="No hay pedidos aún"
          description="Cuando los clientes ordenen desde tu menú público, aparecerán aquí."
        />
      )}

      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{o.customer_name}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {o.type === "delivery" ? "Delivery" : "Take out"} · {formatMoney(o.total_cents)}
              </p>
              <div className="mt-2">
                <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                  {STATUS_LABELS[o.status] ?? o.status}
                </Badge>
              </div>
            </div>
            {NEXT_STATUS[o.status] && (
              <Button variant="secondary" size="sm" onClick={() => advance(o.id, o.status)}>
                → {STATUS_LABELS[NEXT_STATUS[o.status]] ?? NEXT_STATUS[o.status]}
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
