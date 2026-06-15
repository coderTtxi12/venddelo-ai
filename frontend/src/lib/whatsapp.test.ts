import { describe, expect, it } from "vitest";
import { formatWhatsAppOrderMessage } from "./whatsapp";
import type { Order, PublicOrderInput } from "./api/types";

describe("formatWhatsAppOrderMessage", () => {
  it("includes customer and items", () => {
    const order: Order = {
      id: "1",
      restaurant_id: "r",
      type: "takeout",
      customer_name: "Ana",
      customer_phone: "555",
      payment_method: "cash",
      subtotal_cents: 1000,
      total_cents: 1000,
      status: "pending",
      delivery_address: null,
      note: null,
      created_at: "",
      updated_at: "",
      items: [
        {
          id: "i1",
          product_id: "p1",
          product_name: "Taco",
          quantity: 2,
          unit_price_cents: 500,
          selected_options: null,
          line_total_cents: 1000,
        },
      ],
    };
    const input: PublicOrderInput = {
      type: "takeout",
      customer_name: "Ana",
      customer_phone: "555",
      payment_method: "cash",
      items: [{ product_id: "p1", quantity: 2 }],
    };
    const msg = formatWhatsAppOrderMessage(order, input);
    expect(msg).toContain("Ana");
    expect(msg).toContain("Taco");
    expect(msg).toContain("Total");
  });
});
