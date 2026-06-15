import type { Order, PublicOrderInput } from "./api/types";
import { formatMoney } from "./utils";

export function formatWhatsAppOrderMessage(
  order: Order,
  input: PublicOrderInput,
): string {
  const lines = [
    "🍽️ *Nuevo pedido Vendelo*",
    "",
    `*Cliente:* ${input.customer_name}`,
    `*Teléfono:* ${input.customer_phone}`,
    `*Tipo:* ${input.type === "delivery" ? "Delivery" : "Take out"}`,
  ];

  if (input.delivery_address) {
    lines.push(`*Dirección:* ${input.delivery_address}`);
  }

  lines.push("", "*Productos:*");
  for (const item of order.items) {
    lines.push(`• ${item.quantity}x ${item.product_name} — ${formatMoney(item.line_total_cents)}`);
  }

  lines.push(
    "",
    `*Total:* ${formatMoney(order.total_cents)}`,
    `*Pago:* ${input.payment_method}`,
  );

  if (input.note) {
    lines.push(`*Nota:* ${input.note}`);
  }

  return lines.join("\n");
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
