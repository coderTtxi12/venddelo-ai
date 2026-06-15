"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { listAIArtifacts, revertAIArtifact } from "@/lib/api/ai";
import {
  listCategories,
  listProducts,
  publishProduct,
  updateProduct,
} from "@/lib/api/menu";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
} from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

function statusBadge(product: { approval_status: string; is_published: boolean }) {
  if (product.is_published) return { label: "Publicado", tone: "success" as const };
  if (product.approval_status === "approved") return { label: "Aprobado", tone: "brand" as const };
  return { label: "Pendiente", tone: "warning" as const };
}

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

  const productList = products?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editor de menú"
        description={`${categories?.items.length ?? 0} categorías · ${productList.length} productos`}
      />

      {artifacts && artifacts.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 flex items-center gap-2 text-[var(--primary)]">
            <Sparkles className="h-4 w-4" aria-hidden />
            <h2 className="font-display text-lg font-semibold">Optimizaciones IA</h2>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {artifacts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="text-[var(--text-muted)]">
                  {a.entity_type} · {a.field}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === "applied" ? "success" : "neutral"}>{a.status}</Badge>
                  {a.status === "applied" && (
                    <Button variant="ghost" size="sm" onClick={() => handleRevert(a.id)}>
                      Deshacer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {productList.length === 0 ? (
        <EmptyState
          title="Sin productos aún"
          description="Completa el onboarding o agrega platillos manualmente."
        />
      ) : (
        <div className="grid gap-3">
          {productList.map((p) => {
            const badge = statusBadge(p);
            return (
              <Card key={p.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  {editingId === p.id ? (
                    <div className="flex gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Button onClick={() => saveName(p.id)}>Guardar</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="cursor-pointer text-left font-medium transition-colors hover:text-[var(--primary)]"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                    >
                      {p.name}
                    </button>
                  )}
                  <p className="mt-1 text-sm font-medium text-[var(--primary)]">
                    {formatMoney(p.price_cents, p.currency)}
                  </p>
                  <div className="mt-2">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {p.approval_status !== "approved" && (
                    <Button
                      variant="secondary"
                      size="sm"
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
                    <Button size="sm" onClick={() => handlePublish(p.id)}>
                      Publicar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
