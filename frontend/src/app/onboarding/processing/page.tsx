"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { getAIJob, startOptimizeMenu, startPickPalette } from "@/lib/api/ai";
import { Button, Card } from "@/components/ui/primitives";

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-8 pattern-dots">
          <Card>Cargando…</Card>
        </main>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}

function ProcessingContent() {
  const token = useAccessToken();
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");
  const [status, setStatus] = useState("pending");
  const [message, setMessage] = useState("Extrayendo tu menú…");

  useEffect(() => {
    if (!token || !restaurantId) return;

    const raw = sessionStorage.getItem(`onboarding:${restaurantId}`);
    if (!raw) return;
    const { extractJobId } = JSON.parse(raw) as { extractJobId: string };

    let cancelled = false;

    async function poll() {
      const job = await getAIJob(token!, restaurantId!, extractJobId);
      if (cancelled) return;
      setStatus(job.status);
      if (job.status === "completed") {
        setMessage("Optimizando descripciones e imágenes…");
        await startOptimizeMenu(token!, restaurantId!);
        await startPickPalette(token!, restaurantId!);
        setMessage("¡Listo! Revisa tu menú.");
        setTimeout(() => router.push(`/dashboard/${restaurantId}/menu`), 1500);
        return;
      }
      if (job.status === "failed") {
        setMessage(job.error_message ?? "Error en extracción");
        return;
      }
      setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [token, restaurantId, router]);

  const isFailed = status === "failed";
  const isDone = message.startsWith("¡Listo");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 pattern-dots">
      <Card elevated className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          {isFailed ? (
            <Sparkles className="h-7 w-7 text-[var(--text-muted)]" aria-hidden />
          ) : isDone ? (
            <Sparkles className="h-7 w-7 text-[var(--primary)]" aria-hidden />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" aria-hidden />
          )}
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Procesando con IA</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
        </div>
        {!isFailed && !isDone && (
          <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-[var(--border-subtle)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--primary)]" />
          </div>
        )}
        {isFailed && restaurantId && (
          <Button onClick={() => router.push(`/dashboard/${restaurantId}/menu`)}>
            Ir al dashboard
          </Button>
        )}
      </Card>
    </main>
  );
}
