import type { DispatchMonitorDriver } from '../api/types';

export function formatMonitorDriverMapLabel(
  driver: Pick<DispatchMonitorDriver, 'first_name' | 'last_name' | 'plate'>,
): string {
  const firstName = driver.first_name.trim();
  const lastName = driver.last_name.trim();
  if (!firstName && !lastName) return driver.plate.trim() || '—';
  if (!lastName) return firstName;
  const initial = lastName.charAt(0).toLocaleUpperCase('es');
  if (!firstName) return `${initial}.`;
  return `${firstName} ${initial}.`;
}

export function shouldShowDriverOnMonitorMap(
  driver: Pick<DispatchMonitorDriver, 'is_online' | 'active_request_id' | 'occupied_job_count'>,
  focused = false,
): boolean {
  if (focused) return true;
  if (driver.is_online) return true;
  if (driver.active_request_id) return true;
  return (driver.occupied_job_count ?? 0) > 0;
}
