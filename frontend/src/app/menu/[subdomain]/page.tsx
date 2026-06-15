"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { getPublicMenu } from "@/lib/api/menu";
import { getPublicRestaurant } from "@/lib/api/public";
import { createPublicOrder } from "@/lib/api/orders";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import { paletteStyle } from "@/lib/palettes";
import { computeLineTotal, useCartStore } from "@/stores/cart";
import { formatMoney, normalizeLocale } from "@/lib/utils";
import { buildWhatsAppUrl, formatWhatsAppOrderMessage } from "@/lib/whatsapp";
import type { Product } from "@/lib/api/types";

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[var(--text)]/30 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <Card elevated className="relative max-h-[85vh] w-full max-w-md overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--text)]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </Card>
    </div>
  );
}

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
    return (
      <main
        style={palette}
        className="flex min-h-screen items-center justify-center bg-[var(--surface)] text-[var(--text)]"
      >
        <div className="flex items-center gap-2 text-[var(--text)]/70">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando menú…
        </div>
      </main>
    );
  }

  const restaurantName = restaurant?.name ?? "Menú digital";

  return (
    <main style={palette} className="min-h-screen bg-[var(--surface)] pb-28 text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--brand-soft)]/50 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold">{restaurantName}</h1>
        </div>
      </header>

      <section className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-6">
        {menu?.products.map((p) => (
          <Card
            key={p.id}
            onClick={() => setSelected(p)}
            className="border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--brand-muted)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">{p.name}</p>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]/75">{p.description}</p>
                )}
              </div>
              <p className="shrink-0 font-semibold text-[var(--brand)]">{formatMoney(p.price_cents)}</p>
            </div>
          </Card>
        ))}
        {menu?.products.length === 0 && (
          <Card className="text-center text-[var(--text)]/70">
            Este menú aún no tiene productos publicados.
          </Card>
        )}
      </section>

      {lines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-4px_24px_rgb(0_0_0/0.08)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-[var(--brand)]" aria-hidden />
              <span className="text-sm font-medium">
                {lines.length} {lines.length === 1 ? "item" : "items"} · {formatMoney(cartTotal)}
              </span>
            </div>
            <Button onClick={() => setCheckoutOpen(true)}>Ver pedido</Button>
          </div>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4 pt-2">
            <h2 className="pr-8 font-display text-xl font-semibold">{selected.name}</h2>
            {selected.description && (
              <p className="text-sm text-[var(--text)]/75">{selected.description}</p>
            )}
            <p className="text-lg font-semibold text-[var(--brand)]">
              {formatMoney(selected.price_cents)}
            </p>
            {selected.option_groups.map((g) => (
              <div key={g.id} className="space-y-2">
                <p className="text-sm font-medium">{g.title}</p>
                <div className="space-y-1.5">
                  {g.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm transition-colors hover:bg-[var(--brand-soft)]"
                    >
                      <input
                        type={g.selection === "single" ? "radio" : "checkbox"}
                        name={g.id}
                        className="accent-[var(--brand)]"
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
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[var(--text)]/60">
                        +{formatMoney(item.price_delta_cents)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button className="w-full" onClick={addToCart}>
              Agregar al pedido
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <div className="space-y-4 pt-2">
          <h2 className="font-display text-xl font-semibold">Tu pedido</h2>

          <div className="rounded-[var(--radius)] bg-[var(--brand-soft)] px-4 py-3 text-sm">
            {lines.map((l) => (
              <div key={l.product.id} className="flex justify-between py-1">
                <span>
                  {l.quantity}× {l.product.name}
                </span>
                <span>{formatMoney(l.lineTotalCents)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
              <span>Total</span>
              <span className="text-[var(--brand)]">{formatMoney(cartTotal)}</span>
            </div>
          </div>

          <div>
            <Label>Nombre</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div>
            <Label>Tipo de pedido</Label>
            <Select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "takeout" | "delivery")}
            >
              <option value="takeout">Take out</option>
              <option value="delivery">Delivery</option>
            </Select>
          </div>
          {orderType === "delivery" && (
            <div>
              <Label>Dirección</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Forma de pago</Label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="card_terminal">Terminal</option>
            </Select>
          </div>
          <Button className="w-full" disabled={submitting} onClick={submitOrder}>
            {submitting ? "Enviando…" : "Confirmar pedido"}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
