import type { LegacyDbClient } from '../legacyDb';

export const AUDIT_LOGS_COLLECTION = 'audit_logs';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout';

export interface AuditActor {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuditTarget {
  collectionId: string;
  documentId: string;
}

export interface AuditLogInput {
  action: AuditAction;
  actor: AuditActor;
  target: AuditTarget;
  summary: string;
  changes?: {
    fieldKeys?: string[];
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/** Sin Firebase: auditoría pendiente de backend. */
export async function logAuditEvent(_db: LegacyDbClient, _entry: AuditLogInput): Promise<void> {
  return;
}

export async function logAuditEventSafe(_db: LegacyDbClient, _entry: AuditLogInput): Promise<void> {
  return;
}
