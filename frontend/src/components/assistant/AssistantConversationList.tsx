import styles from './AssistantConversationList.module.css';
import type { AssistantConversation } from '@/lib/api/assistant';

type AssistantConversationListProps = {
  conversations: AssistantConversation[];
  activeConversationId: string | null;
  loading: boolean;
  disabled?: boolean;
  onSelect: (conversationId: string) => void;
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function AssistantConversationList({
  conversations,
  activeConversationId,
  loading,
  disabled = false,
  onSelect,
}: AssistantConversationListProps) {
  if (loading) {
    return (
      <div className={styles.wrap} aria-label="Historial de conversaciones">
        <p className={styles.status}>Cargando historial…</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className={styles.wrap} aria-label="Historial de conversaciones">
        <p className={styles.status}>Sin conversaciones anteriores</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap} aria-label="Historial de conversaciones">
      <ul className={styles.list}>
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeConversationId;
          return (
            <li key={conversation.id}>
              <button
                type="button"
                className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                onClick={() => onSelect(conversation.id)}
                disabled={disabled}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className={styles.itemTitle}>{conversation.title}</span>
                <span className={styles.itemMeta}>{formatRelativeTime(conversation.last_message_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
