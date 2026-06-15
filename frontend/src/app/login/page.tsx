"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    <Card className="w-full space-y-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      <p className="text-sm text-zinc-600">Usa tu cuenta de Google para administrar tu restaurante.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button className="w-full" onClick={signInWithGoogle} disabled={loading}>
        {loading ? "Redirigiendo…" : "Continuar con Google"}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => router.push("/")}>
        Volver
      </Button>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Suspense fallback={<Card className="w-full p-6">Cargando…</Card>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
