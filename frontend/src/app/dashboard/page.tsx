"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccessToken } from "@/hooks/use-access-token";
import { listRestaurants } from "@/lib/api/restaurants";
import { Card } from "@/components/ui/primitives";

export default function DashboardIndexPage() {
  const token = useAccessToken();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["restaurants", token],
    enabled: !!token,
    queryFn: () => listRestaurants(token!),
  });

  useEffect(() => {
    if (data?.items.length === 1) {
      router.replace(`/dashboard/${data.items[0].id}/menu`);
    }
  }, [data, router]);

  if (!token || isLoading) {
    return <main className="p-8"><Card>Cargando restaurantes…</Card></main>;
  }

  if (error) {
    return <main className="p-8"><Card>Error al cargar restaurantes.</Card></main>;
  }

  if (!data?.items.length) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <Card className="space-y-3">
          <p>No tienes restaurantes aún.</p>
          <a href="/onboarding" className="text-orange-600 underline">Crear uno</a>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Elige un restaurante</h1>
        <ul className="space-y-2">
          {data.items.map((r) => (
            <li key={r.id}>
              <a className="text-orange-600 underline" href={`/dashboard/${r.id}/menu`}>
                {r.name}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
