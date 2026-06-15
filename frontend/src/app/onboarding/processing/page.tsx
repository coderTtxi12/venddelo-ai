"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccessToken } from "@/hooks/use-access-token";
import { getAIJob, startOptimizeMenu, startPickPalette } from "@/lib/api/ai";
import { Button, Card } from "@/components/ui/primitives";

export default function ProcessingPage() {
  return (
    <Suspense fallback={<main className="p-8">Cargando…</main>}>
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full space-y-3 text-center">
        <h1 className="text-xl font-bold">Procesando con IA</h1>
        <p className="text-sm text-zinc-600">{message}</p>
        <p className="text-xs uppercase tracking-wide text-zinc-400">{status}</p>
        {status === "failed" && restaurantId && (
          <Button onClick={() => router.push(`/dashboard/${restaurantId}/menu`)}>
            Ir al dashboard
          </Button>
        )}
      </Card>
    </main>
  );
}
