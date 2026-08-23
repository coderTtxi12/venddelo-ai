import type { DispatchRequest, DispatchStatus } from '@/lib/api/dispatch';

export type RiderCreditDebtGroup = {
  key: string;
  riderName: string;
  photoUrl: string | null;
  totalCents: number;
  requests: DispatchRequest[];
};

const CASH_CREDIT_STATUSES = new Set<DispatchStatus>([
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
]);

export function hasAssignedRider(request: Pick<DispatchRequest, 'assigned_driver_id' | 'rider' | 'status'>): boolean {
  return (
    request.assigned_driver_id != null ||
    request.rider != null ||
    request.status === 'assigned' ||
    request.status === 'picked_up' ||
    request.status === 'in_transit'
  );
}

export function hasHeldRiderCredit(request: DispatchRequest): boolean {
  if (request.payment_method !== 'cash') return false;
  if (request.credit_hold_status === 'released') return false;
  if (request.credit_hold_status === 'held') return true;
  return hasAssignedRider(request) && CASH_CREDIT_STATUSES.has(request.status);
}

export function wasRiderCreditReleased(request: DispatchRequest): boolean {
  return request.payment_method === 'cash' && request.credit_hold_status === 'released';
}

export function groupHeldRiderCredit(requests: DispatchRequest[]): RiderCreditDebtGroup[] {
  const groups = new Map<string, RiderCreditDebtGroup>();

  for (const request of requests) {
    if (!hasHeldRiderCredit(request)) continue;
    const key = request.assigned_driver_id ?? `request:${request.id}`;
    const current = groups.get(key);
    const amount = request.credit_hold_cents || request.collect_cents;
    if (current) {
      current.totalCents += amount;
      current.requests.push(request);
      continue;
    }
    groups.set(key, {
      key,
      riderName: request.rider?.first_name?.trim() || 'Repartidor',
      photoUrl: request.rider?.photo_url ?? null,
      totalCents: amount,
      requests: [request],
    });
  }

  return [...groups.values()].sort((left, right) => right.totalCents - left.totalCents);
}

export function totalHeldRiderCreditCents(groups: RiderCreditDebtGroup[]): number {
  return groups.reduce((sum, group) => sum + group.totalCents, 0);
}
