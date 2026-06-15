"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Clock, CreditCard, ImageIcon, FileText, Sparkles } from "lucide-react";
import { useAccessToken } from "@/hooks/use-access-token";
import { createRestaurant, setPaymentMethods, setSchedules, updateRestaurant } from "@/lib/api/restaurants";
import { startExtractMenu } from "@/lib/api/ai";
import { Button, Card, Input, Label, StepIndicator } from "@/components/ui/primitives";
import { draftSubdomain } from "@/lib/utils";

const PAYMENT_METHODS = ["cash", "transfer", "card_terminal"] as const;

const STEP_ICONS = [Sparkles, MapPin, Clock, CreditCard, ImageIcon, FileText];

export default function OnboardingPage() {
  const token = useAccessToken();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [sameSchedule, setSameSchedule] = useState(true);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const steps = ["Nombre", "Ubicación", "Horario", "Pagos", "Logo", "Menú"];

  async function finishOnboarding() {
    if (!token || !name || !menuFile) return;
    setLoading(true);
    setError(null);
    try {
      const restaurant = await createRestaurant(token, {
        name,
        subdomain: draftSubdomain(),
        status: "draft",
      });

      await updateRestaurant(token, restaurant.id, {
        address: address || null,
        whatsapp_phone: whatsappPhone || null,
        logo_path: logoFile ? `restaurants/${restaurant.id}/logo` : null,
      });

      const schedule = {
        service_type: "takeout" as const,
        day_of_week: 1,
        opens_at: "09:00:00",
        closes_at: "22:00:00",
      };
      const schedules = sameSchedule
        ? [schedule, { ...schedule, service_type: "delivery" as const }]
        : [schedule];

      await setSchedules(token, restaurant.id, schedules);

      const methods = PAYMENT_METHODS.flatMap((method) => [
        { method, service_type: "takeout" as const, enabled: true },
        { method, service_type: "delivery" as const, enabled: true },
      ]);
      await setPaymentMethods(token, restaurant.id, methods);

      const extractJob = await startExtractMenu(token, restaurant.id, menuFile);
      sessionStorage.setItem(
        `onboarding:${restaurant.id}`,
        JSON.stringify({ extractJobId: extractJob.id }),
      );
      router.push(`/onboarding/processing?restaurantId=${restaurant.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en onboarding");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 pattern-dots">
        <Card elevated className="w-full text-center">
          <p className="text-[var(--text-muted)]">Inicia sesión para continuar.</p>
          <Link href="/login" className="mt-4 inline-block">
            <Button>Ir a login</Button>
          </Link>
        </Card>
      </main>
    );
  }

  const StepIcon = STEP_ICONS[step];

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-[var(--primary)]">Configuración inicial</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Crea tu menú digital</h1>
      </div>

      <StepIndicator steps={steps} current={step} />

      <Card elevated className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--primary-soft)] text-[var(--primary)]">
            <StepIcon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            {step === 0 && (
              <>
                <h2 className="font-display text-xl font-semibold">¿Cómo se llama tu restaurante?</h2>
                <div>
                  <Label>Nombre</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tacos del Centro"
                  />
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="font-display text-xl font-semibold">¿Dónde está ubicado?</h2>
                <div>
                  <Label>Dirección</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle Principal 123"
                  />
                </div>
                <div>
                  <Label>WhatsApp para pedidos</Label>
                  <Input
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+5215512345678"
                  />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="font-display text-xl font-semibold">Horario</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  MVP: Lun 9:00–22:00 para takeout y delivery.
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={sameSchedule}
                    onChange={(e) => setSameSchedule(e.target.checked)}
                  />
                  Mismo horario para delivery
                </label>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="font-display text-xl font-semibold">Métodos de pago</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Todos activos por defecto: efectivo, transferencia y terminal.
                </p>
                <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                  {["Efectivo", "Transferencia", "Terminal"].map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                      {m}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {step === 4 && (
              <>
                <h2 className="font-display text-xl font-semibold">Sube tu logo</h2>
                <p className="text-sm text-[var(--text-muted)]">Opcional. PNG o JPG recomendado.</p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </>
            )}
            {step === 5 && (
              <>
                <h2 className="font-display text-xl font-semibold">Sube tu menú</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Foto, imagen o PDF. La IA extraerá tus platillos.
                </p>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setMenuFile(e.target.files?.[0] ?? null)}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-[var(--radius)] bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="flex justify-between border-t border-[var(--border-subtle)] pt-4">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Atrás
          </Button>
          {step < steps.length - 1 ? (
            <Button disabled={step === 0 && !name} onClick={() => setStep((s) => s + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button disabled={!menuFile || loading} onClick={finishOnboarding}>
              {loading ? "Procesando…" : "Digitalizar menú"}
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
