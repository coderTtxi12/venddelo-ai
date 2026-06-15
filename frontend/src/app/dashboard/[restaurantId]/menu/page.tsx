"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccessToken } from "@/hooks/use-access-token";
import { listAIArtifacts, revertAIArtifact } from "@/lib/api/ai";
import {
  listCategories,
  listProducts,
  publishProduct,
  updateProduct,
} from "@/lib/api/menu";
import { Button, Card, Input } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

export default function MenuEditorPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const token = useAccessToken();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["categories", restaurantId, token],
    enabled: !!token,
    queryFn: () => listCategories(token!, restaurantId),
  });

  const { data: products } = useQuery({
    queryKey: ["products", restaurantId, token],
    enabled: !!token,
    queryFn: () => listProducts(token!, restaurantId),
  });

  const { data: artifacts } = useQuery({
    queryKey: ["artifacts", restaurantId, token],
    enabled: !!token,
    queryFn: () => listAIArtifacts(token!, restaurantId),
  });

  async function handlePublish(productId: string) {
    if (!token) return;
    await publishProduct(token, restaurantId, productId);
    qc.invalidateQueries({ queryKey: ["products", restaurantId] });
  }

  async function handleRevert(artifactId: string) {
    if (!token) return;
    await revertAIArtifact(token, restaurantId, artifactId);
    qc.invalidateQueries({ queryKey: ["products", restaurantId] });
    qc.invalidateQueries({ queryKey: ["artifacts", restaurantId] });
  }

  async function saveName(productId: string) {
    if (!token) return;
    await updateProduct(token, restaurantId, productId, { name: editName });
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["products", restaurantId] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editor de menú</h1>
        <p className="text-sm text-zinc-600">
          {categories?.items.length ?? 0} categorías · {products?.items.length ?? 0} productos
        </p>
      </div>

      {artifacts && artifacts.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Optimizaciones IA</h2>
          <ul className="space-y-2 text-sm">
            {artifacts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>
                  {a.entity_type} · {a.field} · {a.status}
                </span>
                {a.status === "applied" && (
                  <Button variant="ghost" onClick={() => handleRevert(a.id)}>
                    Deshacer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3">
        {products?.items.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {editingId === p.id ? (
                <div className="flex gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <Button onClick={() => saveName(p.id)}>Guardar</Button>
                </div>
              ) : (
                <button
                  className="text-left font-medium hover:underline"
                  onClick={() => {
                    setEditingId(p.id);
                    setEditName(p.name);
                  }}
                >
                  {p.name}
                </button>
              )}
              <p className="text-sm text-zinc-500">{formatMoney(p.price_cents, p.currency)}</p>
              <p className="text-xs text-zinc-400">
                {p.approval_status} · {p.is_published ? "publicado" : "borrador"}
              </p>
            </div>
            {p.approval_status !== "approved" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!token) return;
                  await updateProduct(token, restaurantId, p.id, {
                    approval_status: "approved",
                  });
                  qc.invalidateQueries({ queryKey: ["products", restaurantId] });
                }}
              >
                Aprobar
              </Button>
            )}
            {p.approval_status === "approved" && !p.is_published && (
              <Button onClick={() => handlePublish(p.id)}>Publicar</Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
