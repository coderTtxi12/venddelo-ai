export type DeliveryProviderMemberRole =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'dispatcher'
  | 'driver';

export type InvitableMemberRole = 'admin' | 'operator';

export function memberRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'owner':
      return 'Propietario';
    case 'admin':
      return 'Administrador';
    case 'operator':
      return 'Operador';
    default:
      return 'Usuario';
  }
}

export function canManageMembers(role: string | null | undefined): boolean {
  return role === 'owner';
}

export function canWriteProviderConfig(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManagePartnerships(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'operator';
}

export function canManageWeather(role: string | null | undefined): boolean {
  return canManagePartnerships(role);
}

export function canSimulatePricing(role: string | null | undefined): boolean {
  return canManagePartnerships(role);
}

export function isOperatorRole(role: string | null | undefined): boolean {
  return role === 'operator';
}
