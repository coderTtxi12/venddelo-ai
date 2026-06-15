"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccessToken } from "@/hooks/use-access-token";
import { listOrders, updateOrderStatus } from "@/lib/api/orders";
import { Button, Card } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-sm text-zinc-600">
          Actualización automática cada 10s · Total listado: {formatMoney(todayTotal)}
        </p>
      </div>
      {isLoading && <Card>Cargando…</Card>}
      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{o.customer_name}</p>
              <p className="text-sm text-zinc-500">
                {o.type} · {o.status} · {formatMoney(o.total_cents)}
              </p>
            </div>
            {NEXT_STATUS[o.status] && (
              <Button variant="secondary" onClick={() => advance(o.id, o.status)}>
                → {NEXT_STATUS[o.status]}
              </Button>
            )}
          </Card>
        ))}
        {!isLoading && orders.length === 0 && <Card>No hay pedidos aún.</Card>}
      </div>
    </div>
  );
}
