import type { DispatchMonitorDriver } from '../api/types';

export function shouldShowDriverOnMonitorMap(
  driver: Pick<DispatchMonitorDriver, 'is_online' | 'active_request_id' | 'occupied_job_count'>,
  focused = false,
): boolean {
  if (focused) return true;
  if (driver.is_online) return true;
  if (driver.active_request_id) return true;
  return (driver.occupied_job_count ?? 0) > 0;
}
