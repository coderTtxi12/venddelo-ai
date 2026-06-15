"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/auth/client";
import { Button, Card } from "@/components/ui/primitives";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const next = searchParams.get("next") ?? "/dashboard";
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) throw authError;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
      setLoading(false);
    }
  }

  return (
    <Card elevated className="w-full max-w-md space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <Sparkles className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold">Bienvenido de nuevo</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Accede con Google para gestionar tu menú digital.
        </p>
      </div>
      {error && (
        <p className="rounded-[var(--radius)] bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {error}
        </p>
      )}
      <Button className="w-full" size="lg" onClick={signInWithGoogle} disabled={loading}>
        {loading ? "Redirigiendo…" : "Continuar con Google"}
      </Button>
      <p className="text-center text-xs text-[var(--text-subtle)]">
        <Link href="/" className="cursor-pointer underline-offset-2 hover:underline">
          Volver al inicio
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 pattern-dots">
      <Suspense fallback={<Card className="w-full max-w-md p-8">Cargando…</Card>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
