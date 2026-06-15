"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPublicMenu } from "@/lib/api/menu";
import { getPublicRestaurant } from "@/lib/api/public";
import { createPublicOrder } from "@/lib/api/orders";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { paletteStyle } from "@/lib/palettes";
import { computeLineTotal, useCartStore } from "@/stores/cart";
import { formatMoney, normalizeLocale } from "@/lib/utils";
import { buildWhatsAppUrl, formatWhatsAppOrderMessage } from "@/lib/whatsapp";
import type { Product } from "@/lib/api/types";

export default function PublicMenuPage() {
  const { subdomain } = useParams<{ subdomain: string }>();
  const [locale, setLocale] = useState("default");
  const [selected, setSelected] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<"takeout" | "delivery">("takeout");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [optionPicks, setOptionPicks] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const lines = useCartStore((s) => s.lines);
  const addLine = useCartStore((s) => s.addLine);
  const clear = useCartStore((s) => s.clear);
  const cartTotal = useCartStore((s) => s.totalCents());

  useEffect(() => {
    setLocale(normalizeLocale(navigator.language));
  }, []);

  const { data: menu, isLoading } = useQuery({
    queryKey: ["public-menu", subdomain, locale],
    queryFn: () => getPublicMenu(subdomain, locale),
  });

  const { data: restaurant } = useQuery({
    queryKey: ["public-restaurant", subdomain],
    queryFn: () => getPublicRestaurant(subdomain),
    retry: false,
  });

  const palette = useMemo(
    () => paletteStyle(restaurant?.color_palette ?? "classic"),
    [restaurant?.color_palette],
  );

  function addToCart() {
    if (!selected) return;
    const qty = 1;
    addLine({
      product: selected,
      quantity: qty,
      selectedOptions: optionPicks,
      lineTotalCents: computeLineTotal(selected, qty, optionPicks),
    });
    setSelected(null);
    setOptionPicks({});
  }

  async function submitOrder() {
    setSubmitting(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const body = {
        type: orderType,
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        delivery_address: orderType === "delivery" ? address : undefined,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          selected_options: l.selectedOptions,
        })),
      };
      const order = await createPublicOrder(subdomain, body, idempotencyKey);
      clear();
      setCheckoutOpen(false);

      if (
        process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true" &&
        restaurant?.whatsapp_phone
      ) {
        const msg = formatWhatsAppOrderMessage(order, body);
        window.open(buildWhatsAppUrl(restaurant.whatsapp_phone, msg), "_blank");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <main className="p-6">Cargando menú…</main>;
  }

  return (
    <main style={palette} className="min-h-screen bg-[var(--surface)] text-[var(--text)]">
      <header className="border-b border-black/10 px-4 py-6">
        <h1 className="text-2xl font-bold">Menú digital</h1>
        <p className="text-sm opacity-70">Idioma: {locale}</p>
      </header>

      <section className="mx-auto grid max-w-3xl gap-4 p-4">
        {menu?.products.map((p) => (
          <Card
            key={p.id}
            className="cursor-pointer border-black/10 bg-white/80"
            onClick={() => setSelected(p)}
          >
            <p className="font-semibold">{p.name}</p>
            {p.description && <p className="text-sm opacity-80">{p.description}</p>}
            <p className="mt-1 font-medium text-[var(--brand)]">{formatMoney(p.price_cents)}</p>
          </Card>
        ))}
      </section>

      {lines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span>{lines.length} items · {formatMoney(cartTotal)}</span>
            <Button onClick={() => setCheckoutOpen(true)}>Ver pedido</Button>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <Card className="max-h-[80vh] w-full max-w-md overflow-y-auto">
            <h2 className="text-lg font-bold">{selected.name}</h2>
            <p className="text-sm">{selected.description}</p>
            {selected.option_groups.map((g) => (
              <div key={g.id} className="mt-3">
                <p className="text-sm font-medium">{g.title}</p>
                {g.items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type={g.selection === "single" ? "radio" : "checkbox"}
                      name={g.id}
                      onChange={() => {
                        if (g.selection === "single") {
                          setOptionPicks((prev) => ({ ...prev, [g.id]: [item.id] }));
                        } else {
                          setOptionPicks((prev) => {
                            const cur = prev[g.id] ?? [];
                            const next = cur.includes(item.id)
                              ? cur.filter((x) => x !== item.id)
                              : [...cur, item.id];
                            return { ...prev, [g.id]: next };
                          });
                        }
                      }}
                    />
                    {item.label} (+{formatMoney(item.price_delta_cents)})
                  </label>
                ))}
              </div>
            ))}
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={addToCart}>
                Agregar
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <Card className="w-full max-w-md space-y-3">
            <h2 className="font-bold">Checkout</h2>
            <Label>Nombre</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Label>Teléfono</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <Label>Tipo</Label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "takeout" | "delivery")}
            >
              <option value="takeout">Take out</option>
              <option value="delivery">Delivery</option>
            </select>
            {orderType === "delivery" && (
              <>
                <Label>Dirección</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </>
            )}
            <Label>Pago</Label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card_terminal">Terminal</option>
            </select>
            <Button className="w-full" disabled={submitting} onClick={submitOrder}>
              {submitting ? "Enviando…" : "Confirmar pedido"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setCheckoutOpen(false)}>
              Cancelar
            </Button>
          </Card>
        </div>
      )}
    </main>
  );
}
