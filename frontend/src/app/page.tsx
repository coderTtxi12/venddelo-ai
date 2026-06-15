import Link from "next/link";
import { Button } from "@/components/ui/primitives";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
        Vendelo AI
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Tu menú digital con IA en minutos
      </h1>
      <p className="max-w-xl text-lg text-zinc-600">
        Sube tu menú, deja que la IA lo digitalice y publica tu carta con pedidos por WhatsApp.
      </p>
      <div className="flex gap-3">
        <Link href="/login">
          <Button>Empezar gratis</Button>
        </Link>
        <Link href="/onboarding">
          <Button variant="secondary">Onboarding</Button>
        </Link>
      </div>
    </main>
  );
}
