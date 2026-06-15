"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccessToken } from "@/hooks/use-access-token";
import { createRestaurant, setPaymentMethods, setSchedules, updateRestaurant } from "@/lib/api/restaurants";
import { startExtractMenu } from "@/lib/api/ai";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { draftSubdomain } from "@/lib/utils";

const PAYMENT_METHODS = ["cash", "transfer", "card_terminal"] as const;

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
        ? [
            schedule,
            { ...schedule, service_type: "delivery" as const },
          ]
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
      <main className="mx-auto max-w-lg px-6 py-16">
        <Card>Inicia sesión para continuar.</Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <div className="mb-6 flex gap-2">
        {steps.map((label, i) => (
          <div
            key={label}
            className={`h-1 flex-1 rounded ${i <= step ? "bg-orange-500" : "bg-zinc-200"}`}
            title={label}
          />
        ))}
      </div>
      <Card className="space-y-4">
        {step === 0 && (
          <>
            <h1 className="text-xl font-bold">¿Cómo se llama tu restaurante?</h1>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tacos del Centro" />
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-xl font-bold">¿Dónde está ubicado?</h1>
            <Label>Dirección</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle Principal 123" />
            <Label>WhatsApp para pedidos</Label>
            <Input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="+5215512345678" />
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-xl font-bold">Horario</h1>
            <p className="text-sm text-zinc-600">MVP: Lun 9:00–22:00 para takeout y delivery.</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sameSchedule}
                onChange={(e) => setSameSchedule(e.target.checked)}
              />
              Mismo horario para delivery
            </label>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-xl font-bold">Métodos de pago</h1>
            <p className="text-sm text-zinc-600">Todos activos por defecto (efectivo, transferencia, terminal).</p>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="text-xl font-bold">Sube tu logo</h1>
            <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </>
        )}
        {step === 5 && (
          <>
            <h1 className="text-xl font-bold">Sube tu menú</h1>
            <p className="text-sm text-zinc-600">Foto, imagen o PDF. La IA extraerá tus platillos.</p>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setMenuFile(e.target.files?.[0] ?? null)} />
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between pt-2">
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
