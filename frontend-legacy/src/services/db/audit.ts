import { collection, addDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { withRetry } from './retry';

/** Colección raíz: un documento por evento, ID autogenerado por Firestore */
export const AUDIT_LOGS_COLLECTION = 'audit_logs';

const MAX_RETRIES = 3;

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout';

export interface AuditActor {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuditTarget {
  /** Nombre de la colección afectada, ej. `users`, `stores` */
  collectionId: string;
  /** ID del documento afectado */
  documentId: string;
}

/**
 * Entrada de auditoría (create/update/delete en Firestore o eventos `login` / `logout` en el panel).
 *
 * Campos recomendados que se persisten:
 * - Quién: actor (uid, email, displayName) + actorUid duplicado para índices
 * - Cuándo: occurredAt (serverTimestamp)
 * - Qué: action, target (colección + id + path), summary
 * - Contexto: source/app, metadata libre, changes opcional (before/after)
 * - Cliente: client.userAgent / language (solo en navegador)
 */
export interface AuditLogInput {
  action: AuditAction;
  actor: AuditActor;
  target: AuditTarget;
  /** Texto corto legible, ej. "Alta de administrador" */
  summary: string;
  /** Para updates: qué campos cambiaron y valores (evita datos sensibles innecesarios) */
  changes?: {
    fieldKeys?: string[];
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  /** Cualquier contexto extra (IDs de request, feature flag, etc.) */
  metadata?: Record<string, unknown>;
}

function clientHints(): { userAgent?: string; language?: string } | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  if (!userAgent && !language) return undefined;
  return { userAgent, language };
}

function buildDocument(entry: AuditLogInput) {
  const path = `${entry.target.collectionId}/${entry.target.documentId}`;
  const hints = clientHints();

  return {
    occurredAt: serverTimestamp(),
    action: entry.action,
    source: 'panel',
    app: 'tienda_go_panel',

    actorUid: entry.actor.uid,
    actor: {
      uid: entry.actor.uid,
      email: entry.actor.email,
      displayName: entry.actor.displayName,
    },

    targetCollection: entry.target.collectionId,
    targetDocumentId: entry.target.documentId,
    targetPath: path,

    summary: entry.summary,

    ...(entry.changes ? { changes: entry.changes } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
    ...(hints ? { client: hints } : {}),
  };
}

/**
 * Escribe un registro de auditoría (con reintentos).
 * Si falla, propaga el error — usa `logAuditEventSafe` si no quieres afectar el flujo principal.
 */
export async function logAuditEvent(db: Firestore, entry: AuditLogInput): Promise<void> {
  return withRetry(async () => {
    const ref = collection(db, AUDIT_LOGS_COLLECTION);
    await addDoc(ref, buildDocument(entry));
  }, MAX_RETRIES);
}

/**
 * Igual que `logAuditEvent` pero no lanza: útil para no revertir una operación principal si solo falla el audit.
 */
export async function logAuditEventSafe(db: Firestore, entry: AuditLogInput): Promise<void> {
  try {
    await logAuditEvent(db, entry);
  } catch (err) {
    console.error('[audit_logs] No se pudo registrar el evento:', err);
  }
}
