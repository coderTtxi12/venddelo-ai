import type {
  CustomerSort,
  CustomerSortOrder,
  CustomerSource,
  RestaurantCustomer,
} from '@/lib/api/customers';
import { isLegacyWhatsAppPendingPhone } from '@/lib/digital-menu/checkout/customerPhone';

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  menu: 'Menú digital',
  delivery: 'Pedido manual',
};

export const CUSTOMER_SORT_LABELS: Record<CustomerSort, string> = {
  last_at: 'Más recientes',
  visits: 'Más pedidos',
  spent: 'Mayor gasto',
  name: 'Nombre A–Z',
};

export type CustomerFrequencyFilter = 'all' | 'new' | 'repeat';
export type CustomerSpendFilter = 'all' | 'spent' | 'none';
export type CustomerRecencyFilter = 'all' | '7d' | '30d' | '90d';

export type CustomerListFilters = {
  query?: string;
  source?: CustomerSource | 'all';
  frequency?: CustomerFrequencyFilter;
  spend?: CustomerSpendFilter;
  recency?: CustomerRecencyFilter;
};

export const CUSTOMER_FREQUENCY_LABELS: Record<CustomerFrequencyFilter, string> = {
  all: 'Todos',
  new: 'Nuevos',
  repeat: 'Recurrentes',
};

export const CUSTOMER_SPEND_LABELS: Record<CustomerSpendFilter, string> = {
  all: 'Todos',
  spent: 'Con gasto',
  none: 'Sin gasto',
};

export const CUSTOMER_RECENCY_LABELS: Record<CustomerRecencyFilter, string> = {
  all: 'Cualquier fecha',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const DISPATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Cocinando',
  searching: 'Buscando repartidor',
  offered: 'Oferta enviada',
  assigned: 'Repartidor asignado',
  picked_up: 'En el restaurante',
  in_transit: 'En camino',
  delivered: 'Entregado',
  unassigned: 'Sin repartidor',
  cancelled: 'Cancelado',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function customerInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]!.toLocaleUpperCase('es-MX')).join('');
}

export function customerWhatsAppHref(
  phone: string,
  name: string,
  options?: { couponCode?: string; orderShortId?: string },
): string | null {
  if (isLegacyWhatsAppPendingPhone(phone)) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const greeting = name.trim() ? `Hola ${name.trim()}` : 'Hola';
  let message = `${greeting}, te escribimos de parte del restaurante`;
  if (options?.orderShortId) {
    message += ` sobre tu pedido #${options.orderShortId}`;
  }
  if (options?.couponCode) {
    message += options?.orderShortId
      ? ` con el cupón ${options.couponCode}`
      : `. Tu pedido usó el cupón ${options.couponCode}`;
  }
  message += '.';
  const text = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${text}`;
}

export function matchesCustomerQuery(customer: RestaurantCustomer, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('es-MX');
  if (!needle) return true;
  const digits = customer.customer_phone.replace(/\D/g, '');
  return [
    customer.customer_name.toLocaleLowerCase('es-MX'),
    customer.customer_phone.toLocaleLowerCase('es-MX'),
    customer.phone_key.toLocaleLowerCase('es-MX'),
    digits,
  ].some((haystack) => haystack.includes(needle));
}

export function customerFiltersActive(filters: CustomerListFilters): boolean {
  return Boolean(
    (filters.query ?? '').trim() ||
      (filters.source && filters.source !== 'all') ||
      (filters.frequency && filters.frequency !== 'all') ||
      (filters.spend && filters.spend !== 'all') ||
      (filters.recency && filters.recency !== 'all'),
  );
}

export function filterCustomers(
  customers: RestaurantCustomer[],
  filters: CustomerListFilters = {},
  now = Date.now(),
): RestaurantCustomer[] {
  const query = filters.query ?? '';
  const source = filters.source ?? 'all';
  const frequency = filters.frequency ?? 'all';
  const spend = filters.spend ?? 'all';
  const recency = filters.recency ?? 'all';

  return customers.filter((customer) => {
    if (source !== 'all' && !customer.sources.includes(source)) return false;
    if (frequency === 'new' && customer.visit_count !== 1) return false;
    if (frequency === 'repeat' && customer.visit_count < 2) return false;
    if (spend === 'spent' && customer.total_spent_cents <= 0) return false;
    if (spend === 'none' && customer.total_spent_cents > 0) return false;
    if (recency !== 'all') {
      const lastAt = new Date(customer.last_order_at).getTime();
      if (Number.isNaN(lastAt)) return false;
      const days = recency === '7d' ? 7 : recency === '30d' ? 30 : 90;
      if (now - lastAt > days * DAY_MS) return false;
    }
    return matchesCustomerQuery(customer, query);
  });
}

export function sortCustomers(
  customers: RestaurantCustomer[],
  sort: CustomerSort,
  order?: CustomerSortOrder,
): RestaurantCustomer[] {
  const descending = order ? order === 'desc' : sort !== 'name';
  const copy = [...customers];
  copy.sort((a, b) => {
    let cmp = 0;
    if (sort === 'visits') {
      cmp = a.visit_count - b.visit_count || a.last_order_at.localeCompare(b.last_order_at);
    } else if (sort === 'spent') {
      cmp =
        a.total_spent_cents - b.total_spent_cents || a.last_order_at.localeCompare(b.last_order_at);
    } else if (sort === 'name') {
      cmp = a.customer_name.localeCompare(b.customer_name, 'es-MX', { sensitivity: 'base' });
    } else {
      cmp = a.last_order_at.localeCompare(b.last_order_at);
    }
    return descending ? -cmp : cmp;
  });
  return copy;
}

export function toggleCustomerColumnSort(
  current: { sort: CustomerSort; order: CustomerSortOrder },
  column: CustomerSort,
): { sort: CustomerSort; order: CustomerSortOrder } {
  if (current.sort !== column) {
    return { sort: column, order: column === 'name' ? 'asc' : 'desc' };
  }
  return { sort: column, order: current.order === 'desc' ? 'asc' : 'desc' };
}

export function activityStatusLabel(kind: CustomerSource, status: string): string {
  if (kind === 'delivery') return DISPATCH_STATUS_LABELS[status] ?? status;
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function activityKindLabel(kind: CustomerSource, orderType: string | null): string {
  if (kind === 'delivery') return 'Pedido manual';
  if (orderType === 'delivery') return 'Menú · Domicilio';
  if (orderType === 'takeout') return 'Menú · Para llevar';
  return 'Menú digital';
}

export function visitSummary(customer: RestaurantCustomer): string {
  const parts: string[] = [];
  if (customer.order_count > 0) {
    parts.push(customer.order_count === 1 ? '1 pedido' : `${customer.order_count} pedidos`);
  }
  if (customer.delivery_count > 0) {
    parts.push(
      customer.delivery_count === 1
        ? '1 delivery'
        : `${customer.delivery_count} deliveries`,
    );
  }
  return parts.join(' · ') || 'Sin pedidos';
}
