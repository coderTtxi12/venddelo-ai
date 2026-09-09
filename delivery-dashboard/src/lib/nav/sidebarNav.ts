export type SidebarNavItem = {
  label: string;
  path: string;
};

export type SidebarNavSection = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};

export const SIDEBAR_NAV_SECTIONS: SidebarNavSection[] = [
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      { label: 'Monitor', path: '/monitor' },
      { label: 'Historial', path: '/historial' },
      { label: 'Estadísticas', path: '/estadisticas' },
    ],
  },
  {
    id: 'red',
    label: 'Red',
    items: [
      { label: 'Restaurantes', path: '/partnerships' },
      { label: 'Repartidores', path: '/repartidores' },
    ],
  },
  {
    id: 'servicio',
    label: 'Servicio',
    items: [
      { label: 'Asignación', path: '/asignacion' },
      { label: 'Tarifas', path: '/tariffs' },
      { label: 'Horarios', path: '/horarios' },
      { label: 'Cerco geográfico', path: '/cerco-geografico' },
    ],
  },
  {
    id: 'cuenta',
    label: 'Cuenta',
    items: [{ label: 'Configuración', path: '/settings' }],
  },
];

export function sidebarNavPaths(): string[] {
  return SIDEBAR_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.path));
}

export function showsAllZonesOption(pathname: string): boolean {
  return pathname === '/monitor' || pathname === '/historial' || pathname === '/estadisticas';
}
