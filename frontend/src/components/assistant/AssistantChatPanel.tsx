'use client';

import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';
import ChatAttachmentList from '@/components/assistant/ChatAttachmentList';
import ChatFormComplement from '@/components/assistant/ChatFormComplement';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useStreamingText } from '@/hooks/useStreamingText';
import {
  createAttachmentsFromFileList,
  revokeAttachmentPreviews,
  type ChatAttachment,
} from '@/lib/assistant/chatAttachments';
import {
  formatFormSubmissionAsText,
  MOCK_PRODUCT_FORM,
  MOCK_PROMOTION_FORM,
  type ChatComplement,
  type ChatFormSubmission,
  isChatFormComplement,
} from '@/lib/assistant/chatComplements';
import styles from './AssistantChatPanel.module.css';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
  complement?: ChatComplement;
  complementSubmitted?: boolean;
  formSubmission?: ChatFormSubmission;
};

type PendingAssistantReply = {
  messageId: string;
  fullText: string;
  complement?: ChatComplement;
};

type MockAssistantReply = {
  text: string;
  complement?: ChatComplement;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy tu asistente de Venddelo. Puedo ayudarte a crear productos, promociones, actualizar tu menú y más. También puedes adjuntar imágenes o documentos. ¿Qué te gustaría agregar hoy?',
};

const SUGGESTIONS = [
  'Agregar un producto nuevo',
  'Crear una promoción',
  'Actualizar mi menú digital',
];

const MOCK_RESPONSES = [
  'Perfecto. Para el nuevo producto necesito el nombre, precio y categoría. ¿Cómo se llamará?',
  'Entendido. ¿Prefieres un descuento porcentual o un monto fijo para la promoción?',
  'Puedo ayudarte a reorganizar categorías y destacar tus platillos más vendidos. ¿Por dónde empezamos?',
  'Listo, revisé tu menú. Te sugiero agregar una foto y una descripción corta para mejorar las conversiones.',
  'Claro. Cuando conectemos el backend, podré aplicar estos cambios directamente en tu restaurante.',
];

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickMockResponse(userText: string, attachmentCount: number): MockAssistantReply {
  if (attachmentCount > 0) {
    if (attachmentCount === 1) {
      return {
        text: 'Recibí tu archivo. Lo revisaré y te indico los siguientes pasos para usarlo en tu restaurante.',
      };
    }
    return {
      text: `Recibí ${attachmentCount} archivos. Los revisaré y te digo qué podemos hacer con cada uno.`,
    };
  }

  const lower = userText.toLowerCase();

  if (lower.includes('producto')) {
    return {
      text: 'Perfecto. Para crear el producto, completa este formulario:',
      complement: MOCK_PRODUCT_FORM,
    };
  }
  if (lower.includes('promoci') || lower.includes('descuento')) {
    return {
      text: 'Entendido. Configura la promoción con estas opciones:',
      complement: MOCK_PROMOTION_FORM,
    };
  }
  if (lower.includes('menú') || lower.includes('menu') || lower.includes('categor')) {
    return { text: MOCK_RESPONSES[2] };
  }

  const hash = lower.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return { text: MOCK_RESPONSES[hash % MOCK_RESPONSES.length] };
}

function AssistantStreamingBubble({
  fullText,
  onComplete,
}: {
  fullText: string;
  onComplete: (finalText: string) => void;
}) {
  const { text, isComplete } = useStreamingText(fullText, true);
  const completedRef = useRef(false);

  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      onComplete(fullText);
    }
  }, [isComplete, fullText, onComplete]);

  return (
    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
      {text}
      {!isComplete ? <span className={styles.cursor} aria-hidden /> : null}
    </div>
  );
}

export default function AssistantChatPanel() {
  const { isOpen, closeChat } = useAssistantChat();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingReply, setPendingReply] = useState<PendingAssistantReply | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thinkTimerRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);

  pendingAttachmentsRef.current = pendingAttachments;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  const clearPendingAttachments = useCallback(() => {
    revokeAttachmentPreviews(pendingAttachmentsRef.current);
    setPendingAttachments([]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      window.setTimeout(() => textareaRef.current?.focus(), 280);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, pendingReply, pendingAttachments, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (thinkTimerRef.current != null) {
        window.clearTimeout(thinkTimerRef.current);
      }
      revokeAttachmentPreviews(pendingAttachmentsRef.current);
    };
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  const addAttachments = useCallback((files: FileList | File[]) => {
    const incoming = createAttachmentsFromFileList(files);
    if (incoming.length === 0) return;
    setPendingAttachments((prev) => [...prev, ...incoming]);
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) revokeAttachmentPreviews([target]);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleStreamingComplete = useCallback(
    (messageId: string, finalText: string, complement?: ChatComplement) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: finalText, complement } : msg,
        ),
      );
      setPendingReply(null);
      setIsBusy(false);
    },
    [],
  );

  const sendMessage = useCallback(
    (rawText: string, attachments: ChatAttachment[] = []) => {
      const text = rawText.trim();
      if ((!text && attachments.length === 0) || isBusy) return;

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const assistantMessageId = createId();
      const assistantReply = pickMockResponse(text, attachments.length);

      setMessages((prev) => [...prev, userMessage]);
      setDraft('');
      setPendingAttachments([]);
      setIsBusy(true);
      setIsThinking(true);
      setPendingReply(null);

      if (thinkTimerRef.current != null) {
        window.clearTimeout(thinkTimerRef.current);
      }

      thinkTimerRef.current = window.setTimeout(() => {
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ]);
        setPendingReply({
          messageId: assistantMessageId,
          fullText: assistantReply.text,
          complement: assistantReply.complement,
        });
      }, 700 + Math.random() * 500);
    },
    [isBusy],
  );

  const dispatchAssistantReply = useCallback(
    (reply: MockAssistantReply) => {
      const assistantMessageId = createId();

      setIsBusy(true);
      setIsThinking(true);
      setPendingReply(null);

      if (thinkTimerRef.current != null) {
        window.clearTimeout(thinkTimerRef.current);
      }

      thinkTimerRef.current = window.setTimeout(() => {
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ]);
        setPendingReply({
          messageId: assistantMessageId,
          fullText: reply.text,
          complement: reply.complement,
        });
      }, 700 + Math.random() * 500);
    },
    [],
  );

  const handleFormSubmit = useCallback(
    (submission: ChatFormSubmission) => {
      if (isBusy) return;

      const sourceMessage = messages.find((msg) => msg.id === submission.messageId);
      const complement = sourceMessage?.complement;
      if (!isChatFormComplement(complement)) return;

      const summary = formatFormSubmissionAsText(complement, submission.values);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === submission.messageId ? { ...msg, complementSubmitted: true } : msg,
        ),
      );

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: summary,
        formSubmission: submission,
      };

      setMessages((prev) => [...prev, userMessage]);

      dispatchAssistantReply({
        text: 'Gracias. Recibí tus respuestas y continuaré con el siguiente paso pronto.',
      });
    },
    [dispatchAssistantReply, isBusy, messages],
  );

  const handleSubmit = () => {
    sendMessage(draft, pendingAttachments);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleNewConversation = () => {
    if (thinkTimerRef.current != null) {
      window.clearTimeout(thinkTimerRef.current);
      thinkTimerRef.current = null;
    }
    clearPendingAttachments();
    setMessages([WELCOME_MESSAGE]);
    setDraft('');
    setIsThinking(false);
    setPendingReply(null);
    setIsBusy(false);
    setIsDragActive(false);
    dragCounterRef.current = 0;
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    if (event.dataTransfer.types.includes('Files')) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);

    if (event.dataTransfer.files.length > 0) {
      addAttachments(event.dataTransfer.files);
    }
  };

  const canSend = !isBusy && (draft.trim().length > 0 || pendingAttachments.length > 0);

  return (
    <aside
      className={`${styles.panel} ${isOpen ? styles.open : ''}`}
      aria-hidden={!isOpen}
      aria-label="Asistente de Venddelo"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <div className={styles.dropOverlay} aria-hidden>
          <div className={styles.dropOverlayCard}>
            <UploadFileOutlinedIcon sx={{ fontSize: 28 }} />
            <p className={styles.dropOverlayTitle}>Suelta tus archivos aquí</p>
            <p className={styles.dropOverlayHint}>Imágenes y documentos de cualquier tipo</p>
          </div>
        </div>
      ) : null}

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.avatar} aria-hidden>
            <BrainOutlinedIcon fontSize="inherit" />
          </div>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Asistente</h2>
            <p className={styles.subtitle}>Agrega y gestiona con IA</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleNewConversation}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={closeChat}
            aria-label="Cerrar asistente"
          >
            <CloseOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
      </header>

      <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const isStreamingTarget = pendingReply?.messageId === message.id;
          const hasAttachments = (message.attachments?.length ?? 0) > 0;
          const hasComplement = Boolean(message.complement);
          const attachmentCount = message.attachments?.length ?? 0;
          const attachmentsOnly = hasAttachments && !message.content && !hasComplement;
          const isAttachmentPair = attachmentCount === 2;

          if (!isUser && isStreamingTarget && pendingReply) {
            return (
              <div key={message.id} className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
                <div className={styles.messageAvatar} aria-hidden>
                  <BrainOutlinedIcon fontSize="inherit" />
                </div>
                <div className={styles.assistantContent}>
                  <AssistantStreamingBubble
                    fullText={pendingReply.fullText}
                    onComplete={(finalText) =>
                      handleStreamingComplete(message.id, finalText, pendingReply.complement)
                    }
                  />
                </div>
              </div>
            );
          }

          if (!isUser && !message.content && !hasAttachments && !hasComplement) {
            return null;
          }

          return (
            <div
              key={message.id}
              className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}
            >
              {!isUser ? (
                <div className={styles.messageAvatar} aria-hidden>
                  <BrainOutlinedIcon fontSize="inherit" />
                </div>
              ) : null}
              <div
                className={`${styles.messageContent} ${isUser ? styles.messageContentUser : styles.messageContentAssistant}`}
              >
                {(message.content || hasAttachments) && (
                  <div
                    className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant} ${
                      attachmentsOnly ? styles.bubbleAttachmentsOnly : ''
                    } ${isAttachmentPair ? styles.bubbleAttachmentPair : ''}`}
                  >
                    {message.content ? <span>{message.content}</span> : null}
                    {hasAttachments ? (
                      <ChatAttachmentList
                        attachments={message.attachments ?? []}
                        variant="message"
                        compact={attachmentsOnly}
                      />
                    ) : null}
                  </div>
                )}
                {!isUser && isChatFormComplement(message.complement) ? (
                  <ChatFormComplement
                    complement={message.complement}
                    messageId={message.id}
                    submitted={message.complementSubmitted}
                    onSubmit={handleFormSubmit}
                  />
                ) : null}
              </div>
            </div>
          );
        })}

        {isThinking ? (
          <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
            <div className={styles.messageAvatar} aria-hidden>
              <BrainOutlinedIcon fontSize="inherit" />
            </div>
            <div className={styles.typing} aria-label="El asistente está escribiendo">
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.composer}>
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestionChip}
              disabled={isBusy}
              onClick={() => sendMessage(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {pendingAttachments.length > 0 ? (
          <ChatAttachmentList
            attachments={pendingAttachments}
            variant="pending"
            onRemove={removePendingAttachment}
          />
        ) : null}

        <div className={styles.inputRow}>
          <input
            ref={fileInputRef}
            id="assistant-chat-files"
            type="file"
            className={styles.hiddenFileInput}
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addAttachments(event.target.files);
              }
              event.target.value = '';
            }}
          />
          <label htmlFor="assistant-chat-files" className={styles.attachButton} title="Adjuntar archivo">
            <AttachFileOutlinedIcon sx={{ fontSize: 18 }} />
            <span className={styles.srOnly}>Adjuntar imagen o documento</span>
          </label>

          <label htmlFor="assistant-chat-input" className={styles.srOnly}>
            Mensaje para el asistente
          </label>
          <textarea
            ref={textareaRef}
            id="assistant-chat-input"
            className={styles.textarea}
            rows={1}
            placeholder="Describe qué quieres agregar..."
            value={draft}
            disabled={isBusy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className={styles.sendButton}
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Enviar mensaje"
          >
            <SendOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>

        <p className={styles.hint}>
          Enter para enviar · Shift+Enter para nueva línea · Arrastra archivos al chat
        </p>
      </div>
    </aside>
  );
}
