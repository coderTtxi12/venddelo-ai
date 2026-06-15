import Link from "next/link";
import { ArrowRight, QrCode, Sparkles, UtensilsCrossed } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button, Card } from "@/components/ui/primitives";

const FEATURES = [
  {
    icon: Sparkles,
    title: "IA que digitaliza tu menú",
    description: "Sube una foto o PDF y obtén categorías, platillos y precios listos para revisar.",
  },
  {
    icon: UtensilsCrossed,
    title: "Editor completo",
    description: "Ajusta productos, opciones, promociones y deshaz optimizaciones de la IA.",
  },
  {
    icon: QrCode,
    title: "Publica con QR",
    description: "Comparte tu carta en un enlace propio y recibe pedidos por WhatsApp.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pattern-dots relative overflow-hidden border-b border-[var(--border-subtle)]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--primary-soft)] blur-3xl" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
                Menú digital con IA
              </p>
              <h1 className="text-balance font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">
                Tu restaurante online en minutos, no en semanas
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-[var(--text-muted)]">
                Sube tu menú y logo. La IA extrae platillos, mejora fotos y descripciones.
                Publica tu carta y recibe pedidos por WhatsApp.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/login">
                  <Button size="lg" className="gap-2">
                    Empezar gratis
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </Link>
                <Link href="/onboarding">
                  <Button variant="secondary" size="lg">
                    Ver onboarding
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <Card key={title} elevated className="h-full">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius)] bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-display text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
