'use client';

import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import {
  formatFileSize,
  getFileExtension,
  type ChatAttachment,
} from '@/lib/assistant/chatAttachments';
import styles from './ChatAttachmentList.module.css';

type ChatAttachmentListProps = {
  attachments: ChatAttachment[];
  variant: 'pending' | 'message';
  compact?: boolean;
  onRemove?: (id: string) => void;
};

export default function ChatAttachmentList({
  attachments,
  variant,
  compact = false,
  onRemove,
}: ChatAttachmentListProps) {
  if (attachments.length === 0) return null;

  const isMessagePair = variant === 'message' && attachments.length === 2;

  return (
    <div
      className={`${styles.list} ${variant === 'pending' ? styles.listPending : styles.listMessage} ${
        isMessagePair ? styles.listMessagePair : ''
      } ${isMessagePair && compact ? styles.listMessagePairCompact : ''} ${
        variant === 'pending' && attachments.length === 2 ? styles.listPendingPair : ''
      }`}
      role="list"
      aria-label="Archivos adjuntos"
    >
      {attachments.map((attachment) => {
        const removable = Boolean(onRemove);
        const itemClassName = `${styles.item} ${isMessagePair ? styles.itemPair : ''}`;

        if (attachment.kind === 'image' && attachment.previewUrl) {
          return (
            <div key={attachment.id} className={itemClassName} role="listitem">
              <div className={`${styles.imageCard} ${isMessagePair ? styles.imageCardPair : ''}`}>
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className={styles.imagePreview}
                />
                <div className={styles.imageMeta}>
                  <span className={styles.fileName}>{attachment.name}</span>
                  <span className={styles.fileSize}>{formatFileSize(attachment.size)}</span>
                </div>
              </div>
              {removable ? (
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onRemove?.(attachment.id)}
                  aria-label={`Quitar ${attachment.name}`}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 14 }} />
                </button>
              ) : null}
            </div>
          );
        }

        return (
          <div key={attachment.id} className={itemClassName} role="listitem">
            <div className={`${styles.docCard} ${isMessagePair ? styles.docCardPair : ''}`}>
              <div className={styles.docIcon} aria-hidden>
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 20 }} />
              </div>
              <div className={styles.docMeta}>
                <span className={styles.fileName}>{attachment.name}</span>
                <span className={styles.fileSize}>
                  {getFileExtension(attachment.name)} · {formatFileSize(attachment.size)}
                </span>
              </div>
            </div>
            {removable ? (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove?.(attachment.id)}
                aria-label={`Quitar ${attachment.name}`}
              >
                <CloseOutlinedIcon sx={{ fontSize: 14 }} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
