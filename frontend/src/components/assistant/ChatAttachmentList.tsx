'use client';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import {
  formatFileSize,
  getFileExtension,
  type ChatAttachment,
} from '@/lib/assistant/chatAttachments';
import { useState } from 'react';
import styles from './ChatAttachmentList.module.css';

type ChatAttachmentListProps = {
  attachments: ChatAttachment[];
  variant: 'pending' | 'message';
  tone?: 'default' | 'userBubble';
  compact?: boolean;
  onRemove?: (id: string) => void;
};

function AttachmentImage({
  attachment,
  isUserBubble,
  isPair,
}: {
  attachment: ChatAttachment;
  isUserBubble: boolean;
  isPair: boolean;
}) {
  const [broken, setBroken] = useState(false);

  if (!attachment.previewUrl || broken) {
    return (
      <div
        className={`${styles.imageFallback} ${isUserBubble ? styles.imageFallbackUser : ''} ${
          isPair ? styles.imageFallbackPair : ''
        }`}
        role="img"
        aria-label={`No se pudo mostrar ${attachment.name}`}
      >
        <ImageNotSupportedOutlinedIcon sx={{ fontSize: isUserBubble ? 28 : 22 }} />
        <span>{attachment.name}</span>
      </div>
    );
  }

  return (
    <img
      src={attachment.previewUrl}
      alt={attachment.name}
      className={`${styles.imagePreview} ${isUserBubble ? styles.imagePreviewUser : ''} ${
        isPair ? styles.imagePreviewPair : ''
      }`}
      onError={() => setBroken(true)}
    />
  );
}

export default function ChatAttachmentList({
  attachments,
  variant,
  tone = 'default',
  compact = false,
  onRemove,
}: ChatAttachmentListProps) {
  if (attachments.length === 0) return null;

  const isUserBubble = tone === 'userBubble' && variant === 'message';
  const isMessagePair = variant === 'message' && attachments.length === 2;
  const isSingleImage =
    isUserBubble && attachments.length === 1 && attachments[0]?.kind === 'image';

  return (
    <div
      className={`${styles.list} ${variant === 'pending' ? styles.listPending : styles.listMessage} ${
        isUserBubble ? styles.listUserBubble : ''
      } ${isSingleImage ? styles.listUserBubbleSingleImage : ''} ${
        isMessagePair ? styles.listMessagePair : ''
      } ${isMessagePair && compact ? styles.listMessagePairCompact : ''} ${
        variant === 'pending' && attachments.length === 2 ? styles.listPendingPair : ''
      }`}
      role="list"
      aria-label="Archivos adjuntos"
    >
      {attachments.map((attachment) => {
        const removable = Boolean(onRemove);
        const itemClassName = `${styles.item} ${isMessagePair ? styles.itemPair : ''} ${
          isUserBubble ? styles.itemUserBubble : ''
        }`;

        if (attachment.kind === 'image') {
          return (
            <div key={attachment.id} className={itemClassName} role="listitem">
              <div
                className={`${styles.imageCard} ${isMessagePair ? styles.imageCardPair : ''} ${
                  isUserBubble ? styles.imageCardUser : ''
                }`}
              >
                <AttachmentImage
                  attachment={attachment}
                  isUserBubble={isUserBubble}
                  isPair={isMessagePair}
                />
                {!isUserBubble ? (
                  <div className={styles.imageMeta}>
                    <span className={styles.fileName}>{attachment.name}</span>
                    <span className={styles.fileSize}>{formatFileSize(attachment.size)}</span>
                  </div>
                ) : null}
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
            <div
              className={`${styles.docCard} ${isMessagePair ? styles.docCardPair : ''} ${
                isUserBubble ? styles.docCardUser : ''
              }`}
            >
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
