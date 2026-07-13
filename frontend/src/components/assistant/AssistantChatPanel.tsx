'use client';

import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import ChatAttachmentList from '@/components/assistant/ChatAttachmentList';
import ChatAgentActivity from '@/components/assistant/ChatAgentActivity';
import ChatMarkdown from '@/components/assistant/ChatMarkdown';
import MenuImportQuiz, {
  type MenuImportQuizAnswers,
} from '@/components/assistant/MenuImportQuiz';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatPanelResize } from '@/hooks/useChatPanelResize';
import { resetAssistantConversation, streamAssistantChat } from '@/lib/api/assistant';
import type { MenuImportQuizPayload } from '@/lib/api/assistant';
import { isFetchAbortError } from '@/lib/api/assistantStream';
import {
  CHAT_ATTACHMENT_ACCEPT,
  inferChatAttachmentKind,
  MAX_CHAT_ATTACHMENTS,
  uploadImportAsset,
  type ChatAttachmentRef,
} from '@/lib/api/assistantImport';
import {
  cloneAttachmentsForMessage,
  createAttachmentsFromFileList,
  revokeAttachmentPreviews,
  type ChatAttachment,
} from '@/lib/assistant/chatAttachments';
import {
  INITIAL_AGENT_ACTIVITY,
  STREAMING_AGENT_ACTIVITY,
  applyAgentThought,
  applyToolResult,
  applyToolStart,
  applyWorkflowEvaluationToActivity,
  applyWorkflowPhaseToActivity,
  clearAgentActivityForResponse,
  hasVisibleAgentActivity,
  type AgentActivityState,
} from '@/lib/assistant/agentActivity';
import {
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
} from '@/lib/assistant/chatPanelWidth';
import {
  composeMenuImportUserTurn,
  findPendingMenuImportQuiz,
  hasMenuImportQuizAnswers,
} from '@/lib/assistant/menuImportQuizSubmit';
import { ApiError } from '@/lib/api/types';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './AssistantChatPanel.module.css';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
  menuImportQuiz?: MenuImportQuizPayload | null;
  menuImportQuizSubmitted?: boolean;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el asistente de tu restaurante. Puedo consultar tu menú, ayudarte a importar un menú completo (PDF, Word o fotos) y más. Adjunta archivos con el clip o escribe tu pregunta.',
};

const SUGGESTIONS = [
  '¿Qué categorías tengo?',
  'Quiero importar mi menú',
  '¿Qué promociones están activas?',
];

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AssistantChatPanel() {
  const { isOpen, closeChat } = useAssistantChat();
  const { accessToken } = useAuth();
  const { restaurantId } = useRestaurantOrders();
  const { width: panelWidth, isResizing, onResizePointerDown, onResizeKeyDown } =
    useChatPanelResize(isOpen);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [agentProcessing, setAgentProcessing] = useState(false);
  const [agentActivity, setAgentActivity] = useState<AgentActivityState>(INITIAL_AGENT_ACTIVITY);
  const [quizAnswersByMessageId, setQuizAnswersByMessageId] = useState<
    Record<string, MenuImportQuizAnswers>
  >({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);
  const sendInFlightRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      window.setTimeout(() => textareaRef.current?.focus(), 280);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(streamingMessageId ? 'auto' : 'smooth');
  }, [messages, streamingMessageId, scrollToBottom]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      revokeAttachmentPreviews(pendingAttachmentsRef.current);
    };
  }, []);

  const addPendingFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    setAttachError(null);
    setPendingAttachments((current) => {
      const remaining = MAX_CHAT_ATTACHMENTS - current.length;
      if (remaining <= 0) {
        setAttachError(`Máximo ${MAX_CHAT_ATTACHMENTS} archivos por mensaje.`);
        return current;
      }
      const accepted = incoming.slice(0, remaining);
      if (accepted.length < incoming.length) {
        setAttachError(`Solo se agregaron ${accepted.length} archivo(s); máximo ${MAX_CHAT_ATTACHMENTS}.`);
      }
      return [...current, ...createAttachmentsFromFileList(accepted)];
    });
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        revokeAttachmentPreviews([target]);
      }
      return current.filter((item) => item.id !== id);
    });
    setAttachError(null);
  }, []);

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((current) => {
      revokeAttachmentPreviews(current);
      return [];
    });
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

  const sendMessage = useCallback(
    async (
      rawText: string,
      attachmentsToSend: ChatAttachment[] = pendingAttachments,
      linkedQuizMessageId?: string,
    ) => {
      const text = rawText.trim();
      const hasAttachments = attachmentsToSend.length > 0;
      if ((!text && !hasAttachments) || sendInFlightRef.current) return;

      sendInFlightRef.current = true;
      setIsBusy(true);

      const releaseSendLock = () => {
        sendInFlightRef.current = false;
        setIsBusy(false);
      };

      if (!accessToken || !restaurantId) {
        releaseSendLock();
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            content:
              'No pude conectar con el asistente. Inicia sesión y asegúrate de tener un restaurante configurado.',
          },
        ]);
        return;
      }

      let uploadedAttachments: ChatAttachmentRef[] = [];
      if (hasAttachments) {
        try {
          uploadedAttachments = await Promise.all(
            attachmentsToSend.map(async (attachment) => {
              const file = attachment.file;
              if (!file) {
                throw new Error(`Falta el archivo ${attachment.name}`);
              }
              const kind = inferChatAttachmentKind(file);
              const uploaded = await uploadImportAsset(accessToken, restaurantId, file, kind);
              return {
                storage_path: uploaded.path,
                original_name: uploaded.original_name,
                mime_type: uploaded.mime_type,
                kind: uploaded.kind,
                size_bytes: uploaded.size_bytes,
              };
            }),
          );
        } catch (error) {
          releaseSendLock();
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error && error.message
                ? error.message
                : 'No se pudieron subir los archivos adjuntos.';
          setAttachError(message);
          return;
        }
      }

      const messageAttachments = cloneAttachmentsForMessage(attachmentsToSend);

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
        attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
      };
      const assistantMessageId = createId();

      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      setStreamingMessageId(assistantMessageId);
      setAgentProcessing(true);
      setAgentActivity(STREAMING_AGENT_ACTIVITY);
      setDraft('');
      setAttachError(null);
      clearPendingAttachments();
      setMessages((prev) => {
        const withoutWelcome =
          prev.length === 1 && prev[0]?.id === 'welcome'
            ? []
            : prev.filter((message) => message.id !== 'welcome');
        const withSubmittedQuiz = linkedQuizMessageId
          ? withoutWelcome.map((message) =>
              message.id === linkedQuizMessageId
                ? { ...message, menuImportQuizSubmitted: true }
                : message,
            )
          : withoutWelcome;
        return [
          ...withSubmittedQuiz,
          userMessage,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ];
      });

      if (linkedQuizMessageId) {
        setQuizAnswersByMessageId((current) => {
          const next = { ...current };
          delete next[linkedQuizMessageId];
          return next;
        });
      }

      let streamedContent = '';
      let streamFinished = false;
      let pendingFrame: number | null = null;

      const flushStreamedContent = () => {
        pendingFrame = null;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: streamedContent }
              : message,
          ),
        );
      };

      const cancelPendingFrame = () => {
        if (pendingFrame !== null) {
          cancelAnimationFrame(pendingFrame);
          pendingFrame = null;
        }
      };

      const finishStream = () => {
        if (streamFinished) return;
        streamFinished = true;
        cancelPendingFrame();
        sendInFlightRef.current = false;
        setStreamingMessageId(null);
        setIsBusy(false);
        setAgentProcessing(false);
        setAgentActivity(INITIAL_AGENT_ACTIVITY);
      };

      try {
        await streamAssistantChat(
          accessToken,
          restaurantId,
          {
            message: text,
            conversation_id: conversationId,
            attachments: uploadedAttachments,
          },
          {
            onDelta: (delta) => {
              streamedContent += delta;
              setAgentProcessing(false);
              setAgentActivity((current) => clearAgentActivityForResponse(current));
              if (pendingFrame === null) {
                pendingFrame = requestAnimationFrame(flushStreamedContent);
              }
            },
            onAgentStatus: (status) => {
              if (status === 'processing') {
                setAgentProcessing(true);
                setAgentActivity((current) => ({ ...current, status: 'processing' }));
              }
            },
            onAgentPhase: ({ phase }) => {
              setAgentProcessing(true);
              setAgentActivity((current) => applyWorkflowPhaseToActivity(current, phase));
            },
            onAgentThought: (payload) => {
              setAgentProcessing(true);
              setAgentActivity((current) => applyAgentThought(current, payload));
            },
            onAgentEvaluation: (payload) => {
              setAgentActivity((current) => applyWorkflowEvaluationToActivity(current, payload));
            },
            onToolStart: (payload) => {
              setAgentProcessing(true);
              setAgentActivity((current) => applyToolStart(current, payload));
            },
            onToolResult: (payload) => {
              setAgentActivity((current) => applyToolResult(current, payload));
            },
            onMenuImportQuiz: (quiz) => {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, menuImportQuiz: quiz }
                    : message,
                ),
              );
            },
            onComplete: (payload) => {
              cancelPendingFrame();
              const finalContent = payload.content || streamedContent;
              if (payload.conversation_id) {
                setConversationId(payload.conversation_id);
              }
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: finalContent,
                        menuImportQuiz: payload.menu_import ?? message.menuImportQuiz,
                      }
                    : message,
                ),
              );
              finishStream();
            },
            onError: (error) => {
              cancelPendingFrame();
              if (error.code === 'conversation_not_found') {
                setConversationId(null);
              }
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content:
                          error.code === 'conversation_not_found'
                            ? 'La conversación anterior ya no existe. Envía el mensaje de nuevo.'
                            : `Error: ${error.message}`,
                      }
                    : message,
                ),
              );
              finishStream();
            },
          },
          abortController.signal,
        );

        if (!streamFinished) {
          cancelPendingFrame();
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: streamedContent || 'No recibí respuesta del asistente.',
                  }
                : message,
            ),
          );
          finishStream();
        }
      } catch (error) {
        cancelPendingFrame();
        if (isFetchAbortError(error) || abortController.signal.aborted) {
          if (streamAbortRef.current === abortController) {
            finishStream();
          }
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error && error.message
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
    [accessToken, clearPendingAttachments, conversationId, pendingAttachments, restaurantId],
  );

  const submitMenuImportQuiz = useCallback(
    (messageId: string, answers: MenuImportQuizAnswers) => {
      let submissionText = '';
      setMessages((prev) => {
        const target = prev.find((message) => message.id === messageId);
        if (!target?.menuImportQuiz || target.menuImportQuizSubmitted) {
          return prev;
        }
        submissionText = composeMenuImportUserTurn(draft, target.menuImportQuiz, answers);
        return prev.map((message) =>
          message.id === messageId
            ? { ...message, menuImportQuizSubmitted: true }
            : message,
        );
      });
      if (submissionText) {
        setDraft('');
        setQuizAnswersByMessageId((current) => {
          const next = { ...current };
          delete next[messageId];
          return next;
        });
        void sendMessage(submissionText);
      }
    },
    [draft, sendMessage],
  );

  const handleSubmit = () => {
    if (isBusy || sendInFlightRef.current) return;
    const pendingQuiz = findPendingMenuImportQuiz(messages);
    const pendingAnswers = pendingQuiz
      ? quizAnswersByMessageId[pendingQuiz.messageId]
      : undefined;
    const includeQuiz =
      Boolean(pendingQuiz) &&
      Boolean(pendingAnswers) &&
      hasMenuImportQuizAnswers(pendingAnswers ?? {});
    const outgoingText = composeMenuImportUserTurn(
      draft,
      includeQuiz ? pendingQuiz?.quiz : null,
      pendingAnswers,
    );
    if (!outgoingText.trim() && pendingAttachments.length === 0) return;
    void sendMessage(
      outgoingText,
      pendingAttachments,
      includeQuiz ? pendingQuiz?.messageId : undefined,
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleNewConversation = useCallback(() => {
    if (isBusy) return;
    streamAbortRef.current?.abort();
    messages.forEach((message) => {
      if (message.attachments?.length) {
        revokeAttachmentPreviews(message.attachments);
      }
    });
    setConversationId(null);
    setDraft('');
    clearPendingAttachments();
    setAttachError(null);
    setIsDragging(false);
    setStreamingMessageId(null);
    setAgentProcessing(false);
    setAgentActivity(INITIAL_AGENT_ACTIVITY);
    setMessages([WELCOME_MESSAGE]);
    textareaRef.current?.focus();

    if (accessToken && restaurantId) {
      void resetAssistantConversation(accessToken, restaurantId).catch((error) => {
        const message =
          error instanceof ApiError
            ? error.message
            : 'No se pudo reiniciar la sesión de importación de menú.';
        setAttachError(message);
      });
    }
  }, [
    accessToken,
    clearPendingAttachments,
    isBusy,
    messages,
    restaurantId,
  ]);

  const pendingMenuImportQuiz = findPendingMenuImportQuiz(messages);
  const pendingQuizAnswers = pendingMenuImportQuiz
    ? quizAnswersByMessageId[pendingMenuImportQuiz.messageId]
    : undefined;
  const canSend =
    !isBusy &&
    (draft.trim().length > 0 ||
      pendingAttachments.length > 0 ||
      hasMenuImportQuizAnswers(pendingQuizAnswers ?? {}));

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (isBusy) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (isBusy) return;
    if (event.dataTransfer.files?.length) {
      addPendingFiles(event.dataTransfer.files);
    }
  };

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
      {isOpen && isDragging ? (
        <div className={styles.dropOverlay} aria-hidden>
          <div className={styles.dropOverlayCard}>
            <p className={styles.dropOverlayTitle}>Suelta tus archivos aquí</p>
            <p className={styles.dropOverlayHint}>PDF, Word o imágenes de tu menú</p>
          </div>
        </div>
      ) : null}
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

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.avatar} aria-hidden>
            <BrainOutlinedIcon fontSize="inherit" />
          </div>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Asistente</h2>
            <p className={styles.subtitle}>Menú, importación y más</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleNewConversation}
            aria-label="Nueva conversación"
            title="Nueva conversación"
            disabled={isBusy}
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
          const showAgentActivity =
            isStreaming &&
            (agentProcessing || hasVisibleAgentActivity(agentActivity) || !message.content);

          if (!isUser && !message.content && !isStreaming && !message.menuImportQuiz?.questions.length) {
            return null;
          }

          if (isUser && !message.content && !message.attachments?.length) {
            return null;
          }

          const hasUserAttachments = Boolean(isUser && message.attachments?.length);
          const isUserImageOnly =
            hasUserAttachments &&
            !message.content &&
            message.attachments!.length === 1 &&
            message.attachments![0].kind === 'image';

          return (
            <div
              key={message.id}
              className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}
            >
              {!isUser ? (
                <div
                  className={`${styles.messageAvatar} ${showAgentActivity && !message.content ? styles.messageAvatarAwaiting : ''}`}
                  aria-hidden
                >
                  <BrainOutlinedIcon fontSize="inherit" />
                </div>
              ) : null}
              <div
                className={`${styles.messageContent} ${isUser ? styles.messageContentUser : styles.messageContentAssistant}`}
              >
                <div
                  className={`${styles.messageBody} ${isUser ? styles.messageBodyUser : styles.messageBodyAssistant} ${
                    hasUserAttachments && !message.content ? styles.messageBodyAttachmentsOnly : ''
                  } ${
                    hasUserAttachments && message.attachments!.length === 2
                      ? styles.messageBodyAttachmentPair
                      : ''
                  } ${isUserImageOnly ? styles.messageBodyUserImage : ''}`}
                >
                  {isUser ? (
                    <>
                      {message.content ? <p className={styles.userText}>{message.content}</p> : null}
                      {message.attachments && message.attachments.length > 0 ? (
                        <ChatAttachmentList
                          attachments={message.attachments}
                          variant="message"
                          tone="userBubble"
                          compact={!message.content}
                        />
                      ) : null}
                    </>
                  ) : (
                    <div className={styles.assistantText}>
                      {showAgentActivity ? (
                        <ChatAgentActivity
                          activity={agentActivity}
                          showProcessingDots={agentProcessing && !message.content}
                          compact
                        />
                      ) : null}
                      {message.content ? (
                        isStreaming ? (
                          <>
                            <p className={styles.streamingText}>{message.content}</p>
                            <span className={styles.cursor} aria-hidden />
                          </>
                        ) : (
                          <ChatMarkdown content={message.content} />
                        )
                      ) : null}
                      {message.menuImportQuiz?.questions.length ? (
                        <MenuImportQuiz
                          questions={message.menuImportQuiz.questions}
                          disabled={isBusy}
                          submitted={message.menuImportQuizSubmitted}
                          onSubmit={(answers) => submitMenuImportQuiz(message.id, answers)}
                          onAnswersChange={(answers) => {
                            setQuizAnswersByMessageId((current) => ({
                              ...current,
                              [message.id]: answers,
                            }));
                          }}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

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
              onClick={() => {
                void sendMessage(suggestion);
              }}
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

        {attachError ? <p className={styles.attachError}>{attachError}</p> : null}

        <div className={styles.inputRow}>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.hiddenFileInput}
            accept={CHAT_ATTACHMENT_ACCEPT}
            multiple
            disabled={isBusy}
            onChange={(event) => {
              if (event.target.files) {
                addPendingFiles(event.target.files);
              }
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className={styles.attachButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
            aria-label="Adjuntar imagen o documento"
            title="Adjuntar menú (PDF, Word o foto)"
          >
            <AttachFileOutlinedIcon sx={{ fontSize: 18 }} />
          </button>
          <label htmlFor="assistant-chat-input" className={styles.srOnly}>
            Mensaje para el asistente
          </label>
          <textarea
            ref={textareaRef}
            id="assistant-chat-input"
            className={styles.textarea}
            rows={1}
            placeholder="Escribe o adjunta tu menú (PDF, Word, fotos)…"
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
          Enter para enviar · Shift+Enter para nueva línea · Clip o arrastra archivos
        </p>
      </div>
    </aside>
  );
}
