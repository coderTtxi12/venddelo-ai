"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccessToken } from "@/hooks/use-access-token";
import { createPromotion, listPromotions } from "@/lib/api/promotions";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Promociones</h1>
      <Card className="space-y-3">
        <Label>Nueva promoción</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="10% en pedidos" />
        <Button onClick={handleCreate}>Crear</Button>
      </Card>
      <div className="grid gap-3">
        {data?.items.map((p) => (
          <Card key={p.id}>
            <p className="font-medium">{p.name}</p>
            <p className="text-sm text-zinc-500">
              {p.type} · {p.scope} {p.percent ? `· ${p.percent}%` : ""}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
