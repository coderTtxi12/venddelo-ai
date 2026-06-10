/**
 * Definición de permisos CRUD por módulo (panel Tienda Go).
 * Fuente de verdad para el rol `admin`: PROJECT.md → Tabla CRUD.
 *
 * En Firestore conviene guardar solo `role: "admin"` y resolver permisos desde aquí
 * (u opcionalmente `permissionOverrides` si necesitas excepciones por usuario).
 */

export const CRUD_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type CrudAction = (typeof CRUD_ACTIONS)[number];

/** Claves estables para usar en código y (futuro) reglas / UI */
export const PERMISSION_MODULES = [
  'suppliers',
  'stores',
  'internalUsers',
  'analyticsReports',
  'marketplace',
  'operationsSupport',
  'settings',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** Etiquetas legibles (misma redacción que en PROJECT.md) */
export const MODULE_LABELS: Record<PermissionModule, string> = {
  suppliers: 'Proveedores',
  stores: 'Tiendas (clientes finales de la app)',
  internalUsers: 'Usuarios internos (panel)',
  analyticsReports: 'Analíticas y reportes',
  marketplace: 'Marketplace / catálogo',
  operationsSupport: 'Operación y soporte',
  settings: 'Configuración general',
};

export type ModuleCrud = Record<CrudAction, boolean>;

export type RolePermissions = Record<PermissionModule, ModuleCrud>;

export const ROLES = ['admin', 'analyst'] as const;
export type PanelRole = (typeof ROLES)[number];

/**
 * Permisos por rol. `analyst` queda vacío hasta que definas su matriz en PROJECT.md.
 */
export const PERMISSIONS_BY_ROLE: Record<PanelRole, RolePermissions | null> = {
  admin: {
    suppliers: { read: true, create: true, update: true, delete: true },
    stores: { read: true, create: false, update: true, delete: true },
    internalUsers: { read: true, create: true, update: true, delete: true },
    analyticsReports: { read: true, create: true, update: false, delete: false },
    marketplace: { read: true, create: true, update: true, delete: true },
    operationsSupport: { read: true, create: true, update: true, delete: true },
    settings: { read: true, create: true, update: true, delete: true },
  },
  analyst: null,
};

export function getPermissionsForRole(role: PanelRole): RolePermissions | null {
  return PERMISSIONS_BY_ROLE[role] ?? null;
}

/**
 * Comprueba si el rol tiene la acción CRUD en el módulo.
 * Si el rol no tiene matriz definida, devuelve false.
 */
export function can(
  role: PanelRole,
  module: PermissionModule,
  action: CrudAction
): boolean {
  const matrix = getPermissionsForRole(role);
  if (!matrix) return false;
  return Boolean(matrix[module]?.[action]);
}
