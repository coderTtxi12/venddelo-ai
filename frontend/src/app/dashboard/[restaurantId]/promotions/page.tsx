"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { createPromotion, listPromotions } from "@/lib/api/promotions";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui/primitives";

export default function PromotionsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const token = useAccessToken();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data } = useQuery({
    queryKey: ["promotions", restaurantId, token],
    enabled: !!token,
    queryFn: () => listPromotions(token!, restaurantId),
  });

  async function handleCreate() {
    if (!token || !name) return;
    await createPromotion(token, restaurantId, {
      name,
      type: "percent",
      scope: "order",
      percent: 10,
    });
    setName("");
    qc.invalidateQueries({ queryKey: ["promotions", restaurantId] });
  }

  const promotions = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Promociones"
        description="Crea descuentos para atraer más pedidos."
      />

      <Card elevated className="mb-6 space-y-4">
        <div className="flex items-center gap-2 text-[var(--primary)]">
          <Megaphone className="h-4 w-4" aria-hidden />
          <h2 className="font-display text-lg font-semibold">Nueva promoción</h2>
        </div>
        <div>
          <Label>Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="10% en pedidos"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          MVP: 10% de descuento en todo el pedido.
        </p>
        <Button onClick={handleCreate} disabled={!name}>
          Crear promoción
        </Button>
      </Card>

      {promotions.length === 0 ? (
        <EmptyState
          title="Sin promociones"
          description="Crea tu primera promoción para incentivar pedidos."
        />
      ) : (
        <div className="grid gap-3">
          {promotions.map((p) => (
            <Card key={p.id}>
              <p className="font-medium">{p.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="brand">{p.type}</Badge>
                <Badge tone="neutral">{p.scope}</Badge>
                {p.percent != null && <Badge tone="success">{p.percent}% off</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
