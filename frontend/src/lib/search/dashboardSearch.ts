import type { Category, Order, Product } from '@/lib/api/types';
import { formatOrderDisplayId } from '@/lib/orders/orderDisplay';
import { fuzzyMatchFields } from '@/lib/search/fuzzyMatch';
import { buildProductsPageHref, type ProductsPageFilter } from '@/lib/search/productsPageFilter';

export type DashboardSearchItemKind =
  | 'page'
  | 'section'
  | 'product'
  | 'category'
  | 'order'
  | 'action';

export type DashboardSearchItem = {
  id: string;
  kind: DashboardSearchItemKind;
  title: string;
  subtitle?: string;
  keywords: string[];
  href?: string;
  productsFilter?: ProductsPageFilter;
  action?: 'open-assistant';
  score: number;
};

export type DashboardSearchGroup = {
  id: string;
  label: string;
  items: DashboardSearchItem[];
};

export type DashboardSearchInput = {
  query: string;
  products: Product[];
  categories: Category[];
  orders: Order[];
  limit?: number;
};

const GROUP_LABELS: Record<DashboardSearchItemKind, string> = {
  page: 'Páginas',
  section: 'Configuración',
  product: 'Productos',
  category: 'Categorías',
  order: 'Órdenes',
  action: 'Acciones',
};

const GROUP_ORDER: DashboardSearchItemKind[] = [
  'page',
  'action',
  'order',
  'product',
  'category',
  'section',
];

const STATIC_ITEMS: Omit<DashboardSearchItem, 'score'>[] = [
  {
    id: 'page:dashboard',
    kind: 'page',
    title: 'Dashboard',
    subtitle: 'Resumen del restaurante',
    keywords: ['inicio', 'home', 'panel', 'principal', 'bienvenida'],
    href: '/',
  },
  {
    id: 'page:orders',
    kind: 'page',
    title: 'Órdenes',
    subtitle: 'Pedidos y cocina',
    keywords: ['pedidos', 'ordenes', 'ventas', 'cocina', 'kitchen'],
    href: '/orders',
  },
  {
    id: 'page:products',
    kind: 'page',
    title: 'Productos',
    subtitle: 'Catálogo y categorías',
    keywords: ['productos', 'menu', 'platillos', 'catalogo', 'inventario'],
    href: '/products',
  },
  {
    id: 'page:digital-menu',
    kind: 'page',
    title: 'Menú Digital',
    subtitle: 'Vista previa y QR',
    keywords: ['menu digital', 'qr', 'enlace', 'publico', 'compartir'],
    href: '/digital-menu',
  },
  {
    id: 'page:hours',
    kind: 'page',
    title: 'Horario',
    subtitle: 'Horarios de servicio',
    keywords: ['horarios', 'hours', 'apertura', 'cierre', 'schedule'],
    href: '/hours',
  },
  {
    id: 'page:analytics',
    kind: 'page',
    title: 'Analíticas',
    subtitle: 'Métricas y reportes',
    keywords: ['analiticas', 'estadisticas', 'metricas', 'reportes', 'stats'],
    href: '/analytics',
  },
  {
    id: 'page:marketing',
    kind: 'page',
    title: 'Marketing',
    subtitle: 'Promociones y campañas',
    keywords: ['marketing', 'promociones', 'campanas', 'descuentos'],
    href: '/marketing',
  },
  {
    id: 'page:settings',
    kind: 'page',
    title: 'Configuración',
    subtitle: 'Ajustes generales',
    keywords: ['configuracion', 'ajustes', 'settings', 'opciones'],
    href: '/settings',
  },
  {
    id: 'section:identity',
    kind: 'section',
    title: 'Identidad del restaurante',
    subtitle: 'Nombre, logo y subdominio',
    keywords: ['nombre', 'logo', 'subdominio', 'marca', 'identidad'],
    href: '/settings#settings-identity',
  },
  {
    id: 'section:whatsapp',
    kind: 'section',
    title: 'WhatsApp',
    subtitle: 'Número de contacto',
    keywords: ['whatsapp', 'telefono', 'contacto', 'mensajes'],
    href: '/settings#settings-whatsapp',
  },
  {
    id: 'section:services',
    kind: 'section',
    title: 'Servicios',
    subtitle: 'Para llevar y delivery',
    keywords: ['servicios', 'delivery', 'para llevar', 'takeout'],
    href: '/settings#settings-services',
  },
  {
    id: 'section:payments',
    kind: 'section',
    title: 'Métodos de pago',
    subtitle: 'Efectivo, transferencia y terminal',
    keywords: ['pagos', 'efectivo', 'transferencia', 'terminal', 'tarjeta'],
    href: '/settings#settings-payments',
  },
  {
    id: 'section:location',
    kind: 'section',
    title: 'Ubicación',
    subtitle: 'Dirección y mapa',
    keywords: ['ubicacion', 'direccion', 'mapa', 'location', 'address'],
    href: '/settings#settings-location',
  },
  {
    id: 'section:admins',
    kind: 'section',
    title: 'Administradores',
    subtitle: 'Equipo y accesos',
    keywords: ['administradores', 'equipo', 'invitaciones', 'usuarios', 'accesos'],
    href: '/settings#settings-admins',
  },
  {
    id: 'section:hours',
    kind: 'section',
    title: 'Horarios en configuración',
    subtitle: 'Horario del restaurante',
    keywords: ['horario restaurante', 'apertura', 'cierre'],
    href: '/settings#settings-hours',
  },
  {
    id: 'action:assistant',
    kind: 'action',
    title: 'Mexy AI',
    subtitle: 'Asistente inteligente',
    keywords: ['asistente', 'ia', 'ai', 'chat', 'ayuda', 'mexy'],
    action: 'open-assistant',
  },
];

function scoreItem(query: string, item: Omit<DashboardSearchItem, 'score'>): number {
  const fields = [item.title, item.subtitle ?? '', ...item.keywords];
  const baseScore = fuzzyMatchFields(query, fields);
  if (baseScore === 0) return 0;

  const kindBoost: Record<DashboardSearchItemKind, number> = {
    page: 12,
    action: 10,
    order: 8,
    product: 6,
    category: 5,
    section: 4,
  };

  return baseScore + kindBoost[item.kind];
}

function buildProductItems(products: Product[], categoriesById: Map<string, Category>): Omit<DashboardSearchItem, 'score'>[] {
  return products.map((product) => {
    const categoryNames = product.category_ids
      .map((id) => categoriesById.get(id)?.name)
      .filter(Boolean) as string[];

    return {
      id: `product:${product.id}`,
      kind: 'product' as const,
      title: product.name,
      subtitle: categoryNames.length > 0 ? categoryNames.join(', ') : 'Producto',
      keywords: [
        product.description ?? '',
        ...categoryNames,
        ...product.option_groups.flatMap((group) => [
          group.title,
          ...group.items.map((item) => item.label),
        ]),
      ].filter(Boolean),
      href: buildProductsPageHref({ tab: 'products', query: product.name }),
      productsFilter: { tab: 'products', query: product.name },
    };
  });
}

function buildCategoryItems(categories: Category[]): Omit<DashboardSearchItem, 'score'>[] {
  return categories.map((category) => ({
    id: `category:${category.id}`,
    kind: 'category' as const,
    title: category.name,
    subtitle: 'Categoría',
    keywords: [category.description ?? ''],
    href: buildProductsPageHref({ tab: 'categories', query: category.name }),
    productsFilter: { tab: 'categories', query: category.name },
  }));
}

function buildOrderItems(orders: Order[]): Omit<DashboardSearchItem, 'score'>[] {
  return orders.map((order) => {
    const displayId = formatOrderDisplayId(order);
    const itemNames = order.items.map((item) => item.product_name).join(', ');

    return {
      id: `order:${order.id}`,
      kind: 'order' as const,
      title: `Pedido #${displayId}`,
      subtitle: [order.customer_name, itemNames].filter(Boolean).join(' · '),
      keywords: [
        order.id,
        displayId,
        order.customer_name,
        order.customer_phone,
        order.delivery_address ?? '',
        order.note ?? '',
        itemNames,
        order.status,
      ].filter(Boolean),
      href: '/orders',
    };
  });
}

export function searchDashboard(input: DashboardSearchInput): DashboardSearchItem[] {
  const query = input.query.trim();
  if (!query) return [];

  const limit = input.limit ?? 12;
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));

  const candidates: Omit<DashboardSearchItem, 'score'>[] = [
    ...STATIC_ITEMS,
    ...buildProductItems(input.products, categoriesById),
    ...buildCategoryItems(input.categories),
    ...buildOrderItems(input.orders),
  ];

  const scored = candidates
    .map((item) => ({ ...item, score: scoreItem(query, item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

  return scored.slice(0, limit);
}

export function groupDashboardSearchResults(items: DashboardSearchItem[]): DashboardSearchGroup[] {
  const groups = new Map<DashboardSearchItemKind, DashboardSearchItem[]>();

  for (const item of items) {
    const bucket = groups.get(item.kind) ?? [];
    bucket.push(item);
    groups.set(item.kind, bucket);
  }

  return GROUP_ORDER.flatMap((kind) => {
    const groupItems = groups.get(kind);
    if (!groupItems || groupItems.length === 0) return [];
    return [{ id: kind, label: GROUP_LABELS[kind], items: groupItems }];
  });
}

export function getDashboardSearchSuggestions(): string[] {
  return ['Órdenes', 'Productos', 'Analíticas', 'Configuración'];
}
