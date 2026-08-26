export type TicketPaperWidthMm = 58 | 80;

export type TicketPrintSettings = {
  enabled: boolean;
  paper_width_mm: TicketPaperWidthMm;
  copies: number;
  show_logo: boolean;
  brand_name: string;
  header_extra: string;
  footer_message: string;
  show_customer: boolean;
  show_phone: boolean;
  show_address: boolean;
  show_payment: boolean;
  show_notes: boolean;
  show_order_type: boolean;
  show_datetime: boolean;
  show_items: boolean;
  show_restaurant_address: boolean;
};

export const DEFAULT_TICKET_PRINT_SETTINGS: TicketPrintSettings = {
  enabled: false,
  paper_width_mm: 80,
  copies: 1,
  show_logo: true,
  brand_name: '',
  header_extra: '',
  footer_message: '¡Gracias por tu pedido!',
  show_customer: true,
  show_phone: true,
  show_address: true,
  show_payment: true,
  show_notes: true,
  show_order_type: true,
  show_datetime: true,
  show_items: true,
  show_restaurant_address: true,
};

export type KitchenTicketPrintTrigger = 'confirm' | 'request_rider';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asTrimmed(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normalizeTicketPrintSettings(value: unknown): TicketPrintSettings {
  const raw = asRecord(value);
  const copiesRaw = Number(raw.copies);
  const copies = Number.isFinite(copiesRaw) ? Math.max(1, Math.min(3, Math.round(copiesRaw))) : 1;
  return {
    enabled: asBoolean(raw.enabled, DEFAULT_TICKET_PRINT_SETTINGS.enabled),
    paper_width_mm: raw.paper_width_mm === 58 || raw.paper_width_mm === '58' ? 58 : 80,
    copies,
    show_logo: asBoolean(raw.show_logo, DEFAULT_TICKET_PRINT_SETTINGS.show_logo),
    brand_name: asTrimmed(raw.brand_name, 80),
    header_extra: asTrimmed(raw.header_extra, 240),
    footer_message:
      raw.footer_message === undefined
        ? DEFAULT_TICKET_PRINT_SETTINGS.footer_message
        : asTrimmed(raw.footer_message, 240),
    show_customer: asBoolean(raw.show_customer, DEFAULT_TICKET_PRINT_SETTINGS.show_customer),
    show_phone: asBoolean(raw.show_phone, DEFAULT_TICKET_PRINT_SETTINGS.show_phone),
    show_address: asBoolean(raw.show_address, DEFAULT_TICKET_PRINT_SETTINGS.show_address),
    show_payment: asBoolean(raw.show_payment, DEFAULT_TICKET_PRINT_SETTINGS.show_payment),
    show_notes: asBoolean(raw.show_notes, DEFAULT_TICKET_PRINT_SETTINGS.show_notes),
    show_order_type: asBoolean(raw.show_order_type, DEFAULT_TICKET_PRINT_SETTINGS.show_order_type),
    show_datetime: asBoolean(raw.show_datetime, DEFAULT_TICKET_PRINT_SETTINGS.show_datetime),
    show_items: asBoolean(raw.show_items, DEFAULT_TICKET_PRINT_SETTINGS.show_items),
    show_restaurant_address: asBoolean(
      raw.show_restaurant_address,
      DEFAULT_TICKET_PRINT_SETTINGS.show_restaurant_address,
    ),
  };
}

export function shouldPrintKitchenTicket(opts: {
  enabled: boolean;
  hasDefaultPrinter: boolean;
  orderType: 'takeout' | 'delivery';
  trigger: KitchenTicketPrintTrigger;
}): boolean {
  if (!opts.enabled || !opts.hasDefaultPrinter) return false;
  if (opts.trigger === 'confirm') return opts.orderType === 'takeout';
  return opts.orderType === 'delivery';
}
