"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { listRestaurants } from "@/lib/api/restaurants";
import { Button, Card, EmptyState } from "@/components/ui/primitives";

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
    return (
      <main className="flex min-h-screen items-center justify-center p-8 pattern-dots">
        <Card elevated>Cargando restaurantes…</Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <EmptyState title="Error al cargar" description="No pudimos obtener tus restaurantes." />
      </main>
    );
  }

  if (!data?.items.length) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 pattern-dots">
        <EmptyState
          title="Aún no tienes restaurantes"
          description="Crea tu primer menú digital en unos minutos con ayuda de la IA."
          action={
            <Link href="/onboarding">
              <Button className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Crear restaurante
              </Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg p-8 pattern-dots">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold">Elige un restaurante</h1>
      </div>
      <div className="space-y-3">
        {data.items.map((r) => (
          <Link key={r.id} href={`/dashboard/${r.id}/menu`}>
            <Card
              elevated
              className="flex cursor-pointer items-center justify-between transition-colors hover:bg-[var(--primary-soft)]/30"
            >
              <span className="font-medium">{r.name}</span>
              <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
