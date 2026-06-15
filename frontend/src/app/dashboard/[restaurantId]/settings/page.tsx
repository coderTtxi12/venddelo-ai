"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useAccessToken } from "@/hooks/use-access-token";
import { getRestaurant, updateRestaurant } from "@/lib/api/restaurants";
import { listProducts } from "@/lib/api/menu";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

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
    QRCode.toDataURL(publicUrl, { width: 200 }).then(setQrDataUrl);
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

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Publicar menú</h1>
      <Card className="space-y-4">
        <div>
          <Label>Subdominio</Label>
          <Input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="mi-restaurante"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handlePublish}>Publicar</Button>
        {restaurant?.status === "published" && publicUrl && (
          <div className="space-y-2 border-t pt-4 text-sm">
            <p>
              <span className="font-medium">Enlace:</span>{" "}
              <a className="text-orange-600 underline" href={publicUrl}>
                {publicUrl}
              </a>
            </p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR del menú" className="rounded border" />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
