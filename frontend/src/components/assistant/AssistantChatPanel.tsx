'use client';

import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import ChatAttachmentList from '@/components/assistant/ChatAttachmentList';
import ChatFormComplement from '@/components/assistant/ChatFormComplement';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatPanelResize } from '@/hooks/useChatPanelResize';
import {
  createAttachmentsFromFileList,
  revokeAttachmentPreviews,
  type ChatAttachment,
} from '@/lib/assistant/chatAttachments';
import {
  formatFormSubmissionAsText,
  type ChatComplement,
  type ChatFormSubmission,
  isChatFormComplement,
} from '@/lib/assistant/chatComplements';
import {
  streamAssistantChat,
  type AssistantChatHistoryMessage,
} from '@/lib/api/assistant';
import {
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
} from '@/lib/assistant/chatPanelWidth';
import { ApiError } from '@/lib/api/types';
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

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAssistantHistory(messages: ChatMessage[]): AssistantChatHistoryMessage[] {
  return messages
    .filter((message) => message.id !== 'welcome' && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function buildOutboundMessage(text: string, attachments: ChatAttachment[]): string {
  if (attachments.length === 0) return text;
  const names = attachments.map((item) => item.name).join(', ');
  if (!text) return `[Adjuntos: ${names}]`;
  return `${text}\n\n[Adjuntos: ${names}]`;
}

export default function AssistantChatPanel() {
  const { isOpen, closeChat } = useAssistantChat();
  const { accessToken } = useAuth();
  const { restaurantId } = useRestaurantOrders();
  const { width: panelWidth, isResizing, onResizePointerDown, onResizeKeyDown } =
    useChatPanelResize(isOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);

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
  }, [messages, isThinking, streamingMessageId, pendingAttachments, scrollToBottom]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
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

  const requestAssistantReply = useCallback(
    async (outboundMessage: string, historyMessages: ChatMessage[]) => {
      if (sendInFlightRef.current) return;

      if (!accessToken || !restaurantId) {
        const assistantMessage: ChatMessage = {
          id: createId(),
          role: 'assistant',
          content:
            'No pude conectar con el asistente. Inicia sesión y asegúrate de tener un restaurante configurado.',
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsBusy(false);
        return;
      }

      const assistantMessageId = createId();
      sendInFlightRef.current = true;
      setIsBusy(true);
      setIsThinking(true);
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: 'assistant', content: '' },
      ]);
      setIsThinking(false);
      setStreamingMessageId(assistantMessageId);

      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      let streamedContent = '';
      let streamFinished = false;

      const finishStream = () => {
        if (streamFinished) return;
        streamFinished = true;
        sendInFlightRef.current = false;
        setStreamingMessageId(null);
        setIsBusy(false);
      };

      try {
        await streamAssistantChat(
          accessToken,
          restaurantId,
          {
            message: outboundMessage,
            history: buildAssistantHistory(historyMessages),
          },
          {
            onDelta: (delta) => {
              streamedContent += delta;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: streamedContent }
                    : message,
                ),
              );
            },
            onComplete: (payload) => {
              const finalContent = payload.content || streamedContent;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: finalContent }
                    : message,
                ),
              );
              finishStream();
            },
            onError: (error) => {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: `Error: ${error.message}` }
                    : message,
                ),
              );
              finishStream();
            },
          },
          abortController.signal,
        );
        if (!streamFinished) {
          finishStream();
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          finishStream();
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : 'No se pudo contactar al asistente. Intenta de nuevo.';
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId ? { ...item, content: message } : item,
          ),
        );
        finishStream();
      }
    },
    [accessToken, restaurantId],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachments: ChatAttachment[] = []) => {
      const text = rawText.trim();
      if ((!text && attachments.length === 0) || isBusy || sendInFlightRef.current) return;

      setIsBusy(true);
      const outboundMessage = buildOutboundMessage(text, attachments);
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const historyMessages = [...messages, userMessage];
      setMessages((prev) => [...prev, userMessage]);
      setDraft('');
      setPendingAttachments([]);
      await requestAssistantReply(outboundMessage, historyMessages);
    },
    [isBusy, messages, requestAssistantReply],
  );

  const handleSubmit = () => {
    if (isBusy || sendInFlightRef.current) return;
    void sendMessage(draft, pendingAttachments);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleFormSubmit = useCallback(
    async (submission: ChatFormSubmission) => {
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

      const historyMessages = [...messages, userMessage];
      setMessages((prev) => [...prev, userMessage]);
      await requestAssistantReply(summary, historyMessages);
    },
    [isBusy, messages, requestAssistantReply],
  );

  const handleNewConversation = () => {
    streamAbortRef.current?.abort();
    sendInFlightRef.current = false;
    clearPendingAttachments();
    setMessages([WELCOME_MESSAGE]);
    setDraft('');
    setIsThinking(false);
    setStreamingMessageId(null);
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
      className={`${styles.panel} ${isOpen ? styles.open : ''} ${isResizing ? styles.resizing : ''}`}
      style={
        isOpen
          ? ({ '--chat-panel-width': `${panelWidth}px` } as CSSProperties)
          : undefined
      }
      aria-hidden={!isOpen}
      aria-label="Asistente de Venddelo"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isOpen ? (
        <button
          type="button"
          className={styles.resizeHandle}
          aria-label="Ajustar ancho del chat"
          aria-orientation="vertical"
          aria-valuemin={MIN_CHAT_PANEL_WIDTH}
          aria-valuemax={MAX_CHAT_PANEL_WIDTH}
          aria-valuenow={panelWidth}
          title="Arrastra para cambiar el ancho"
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
        />
      ) : null}
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
          const isStreaming = streamingMessageId === message.id;
          const hasAttachments = (message.attachments?.length ?? 0) > 0;
          const hasComplement = Boolean(message.complement);
          const attachmentCount = message.attachments?.length ?? 0;
          const attachmentsOnly = hasAttachments && !message.content && !hasComplement;
          const isAttachmentPair = attachmentCount === 2;

          if (!isUser && !message.content && !hasAttachments && !hasComplement && !isStreaming) {
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
                {(message.content || hasAttachments || isStreaming) && (
                  <div
                    className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant} ${
                      attachmentsOnly ? styles.bubbleAttachmentsOnly : ''
                    } ${isAttachmentPair ? styles.bubbleAttachmentPair : ''}`}
                  >
                    {message.content ? <span>{message.content}</span> : null}
                    {isStreaming ? <span className={styles.cursor} aria-hidden /> : null}
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
