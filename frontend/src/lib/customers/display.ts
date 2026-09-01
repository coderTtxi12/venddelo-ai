import type {
  CustomerSort,
  CustomerSource,
  RestaurantCustomer,
} from '@/lib/api/customers';
import { isLegacyWhatsAppPendingPhone } from '@/lib/digital-menu/checkout/customerPhone';

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  menu: 'Menú digital',
  delivery: 'Delivery',
};

export const CUSTOMER_SORT_LABELS: Record<CustomerSort, string> = {
  last_at: 'Más recientes',
  visits: 'Más pedidos',
  spent: 'Mayor gasto',
  name: 'Nombre A–Z',
};

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

export function customerWhatsAppHref(phone: string, name: string): string | null {
  if (isLegacyWhatsAppPendingPhone(phone)) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const greeting = name.trim() ? `Hola ${name.trim()}` : 'Hola';
  const text = encodeURIComponent(`${greeting}, te escribimos de parte del restaurante.`);
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

export function filterCustomers(
  customers: RestaurantCustomer[],
  query: string,
  source: CustomerSource | 'all',
): RestaurantCustomer[] {
  return customers.filter((customer) => {
    if (source !== 'all' && !customer.sources.includes(source)) return false;
    return matchesCustomerQuery(customer, query);
  });
}

export function sortCustomers(
  customers: RestaurantCustomer[],
  sort: CustomerSort,
): RestaurantCustomer[] {
  const copy = [...customers];
  if (sort === 'visits') {
    return copy.sort((a, b) => b.visit_count - a.visit_count || b.last_order_at.localeCompare(a.last_order_at));
  }
  if (sort === 'spent') {
    return copy.sort(
      (a, b) => b.total_spent_cents - a.total_spent_cents || b.last_order_at.localeCompare(a.last_order_at),
    );
  }
  if (sort === 'name') {
    return copy.sort((a, b) =>
      a.customer_name.localeCompare(b.customer_name, 'es-MX', { sensitivity: 'base' }),
    );
  }
  return copy.sort((a, b) => b.last_order_at.localeCompare(a.last_order_at));
}

export function activityStatusLabel(kind: CustomerSource, status: string): string {
  if (kind === 'delivery') return DISPATCH_STATUS_LABELS[status] ?? status;
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function activityKindLabel(kind: CustomerSource, orderType: string | null): string {
  if (kind === 'delivery') return 'Delivery manual';
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
