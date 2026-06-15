"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ExternalLink, QrCode } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { getRestaurant, updateRestaurant } from "@/lib/api/restaurants";
import { listProducts } from "@/lib/api/menu";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
} from "@/components/ui/primitives";

export default function SettingsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const token = useAccessToken();
  const qc = useQueryClient();
  const [subdomain, setSubdomain] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", restaurantId, token],
    enabled: !!token,
    queryFn: () => getRestaurant(token!, restaurantId),
  });

  const { data: products } = useQuery({
    queryKey: ["products", restaurantId, token],
    enabled: !!token,
    queryFn: () => listProducts(token!, restaurantId),
  });

  useEffect(() => {
    if (restaurant?.subdomain) setSubdomain(restaurant.subdomain);
  }, [restaurant?.subdomain]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = subdomain ? `${appUrl}/menu/${subdomain}` : "";

  useEffect(() => {
    if (!publicUrl) return;
    QRCode.toDataURL(publicUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#450a0a", light: "#ffffff" },
    }).then(setQrDataUrl);
  }, [publicUrl]);

  const publishedCount =
    products?.items.filter((p) => p.is_published && p.approval_status === "approved").length ?? 0;

  async function handlePublish() {
    if (!token || !subdomain) return;
    setError(null);
    if (publishedCount < 1) {
      setError("Publica al menos un producto aprobado antes de lanzar.");
      return;
    }
    try {
      await updateRestaurant(token, restaurantId, {
        subdomain,
        status: "published",
      });
      qc.invalidateQueries({ queryKey: ["restaurant", restaurantId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al publicar");
    }
  }

  const isPublished = restaurant?.status === "published";

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Publicar menú"
        description="Configura tu enlace público y comparte el QR con tus clientes."
        action={
          isPublished ? (
            <Badge tone="success">Publicado</Badge>
          ) : (
            <Badge tone="warning">Borrador</Badge>
          )
        }
      />

      <Card elevated className="space-y-5">
        <div>
          <Label>Subdominio</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">{appUrl}/menu/</span>
            <Input
              className="flex-1"
              value={subdomain}
              onChange={(e) =>
                setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              placeholder="mi-restaurante"
            />
          </div>
        </div>

        <p className="text-sm text-[var(--text-muted)]">
          {publishedCount} producto{publishedCount !== 1 ? "s" : ""} listo
          {publishedCount !== 1 ? "s" : ""} para publicar
        </p>

        {error && (
          <p className="rounded-[var(--radius)] bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <Button onClick={handlePublish} className="w-full sm:w-auto">
          {isPublished ? "Actualizar publicación" : "Publicar menú"}
        </Button>

        {isPublished && publicUrl && (
          <div className="space-y-4 border-t border-[var(--border-subtle)] pt-5">
            <div className="flex items-center gap-2 text-[var(--primary)]">
              <QrCode className="h-4 w-4" aria-hidden />
              <h2 className="font-display text-lg font-semibold">Tu menú en línea</h2>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline"
            >
              {publicUrl}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {qrDataUrl && (
              <div className="inline-block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-white p-4 shadow-[var(--shadow-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR del menú" width={200} height={200} />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
