'use client';

import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import AssistantConversationList from '@/components/assistant/AssistantConversationList';
import ChatAgentActivity from '@/components/assistant/ChatAgentActivity';
import ChatAttachmentList from '@/components/assistant/ChatAttachmentList';
import ChatFormComplement from '@/components/assistant/ChatFormComplement';
import ChatMarkdown from '@/components/assistant/ChatMarkdown';
import ChatStreamProcessing from '@/components/assistant/ChatStreamProcessing';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatPanelResize } from '@/hooks/useChatPanelResize';
import {
  createToolStepId,
  INITIAL_AGENT_ACTIVITY,
  type AgentActivityState,
} from '@/lib/assistant/agentActivity';
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
  createAssistantConversation,
  getAssistantProfile,
  listAssistantConversations,
  loadAllAssistantMessages,
  streamAssistantChat,
  updateAssistantProfile,
  type AssistantConversation,
  type AssistantProfile,
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

function mapApiMessagesToChat(
  rows: Awaited<ReturnType<typeof loadAllAssistantMessages>>,
): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
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
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [assistantNameDraft, setAssistantNameDraft] = useState('');
  const [agentProcessing, setAgentProcessing] = useState(false);
  const [agentActivity, setAgentActivity] = useState<AgentActivityState>(INITIAL_AGENT_ACTIVITY);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const assistantProfileRef = useRef<AssistantProfile | null>(null);

  pendingAttachmentsRef.current = pendingAttachments;
  activeConversationIdRef.current = activeConversationId;
  assistantProfileRef.current = assistantProfile;

  const refreshConversations = useCallback(async () => {
    if (!accessToken || !restaurantId) return;
    const page = await listAssistantConversations(accessToken, restaurantId);
    setConversations(page.items);
  }, [accessToken, restaurantId]);

  const loadConversationMessages = useCallback(
    async (conversationId: string) => {
      if (!accessToken || !restaurantId) return;
      setMessagesLoading(true);
      try {
        const rows = await loadAllAssistantMessages(accessToken, restaurantId, conversationId);
        const mapped = mapApiMessagesToChat(rows);
        setMessages(mapped.length > 0 ? mapped : [WELCOME_MESSAGE]);
      } catch (error) {
        console.error(error);
        setMessages([
          {
            id: createId(),
            role: 'assistant',
            content: 'No se pudo cargar esta conversación. Intenta de nuevo.',
          },
        ]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [accessToken, restaurantId],
  );

  const selectConversation = useCallback(
    async (conversationId: string) => {
      if (isBusy || sendInFlightRef.current) return;
      setActiveConversationId(conversationId);
      await loadConversationMessages(conversationId);
    },
    [isBusy, loadConversationMessages],
  );

  useEffect(() => {
    const token = accessToken;
    const rid = restaurantId;
    if (!isOpen || !token || !rid) return;

    let cancelled = false;

    async function bootstrap(token: string, rid: string) {
      setConversationsLoading(true);
      setProfileLoading(true);
      try {
        const profile = await getAssistantProfile(token, rid);
        if (cancelled) return;
        setAssistantProfile(profile);
        setAssistantNameDraft(profile.display_name);

        const page = await listAssistantConversations(token, rid);
        if (cancelled) return;

        if (page.items.length > 0) {
          setConversations(page.items);
          const initial = page.items[0]!;
          setActiveConversationId(initial.id);
          const rows = await loadAllAssistantMessages(token, rid, initial.id);
          if (cancelled) return;
          const mapped = mapApiMessagesToChat(rows);
          setMessages(mapped.length > 0 ? mapped : [WELCOME_MESSAGE]);
          return;
        }

        const created = await createAssistantConversation(token, rid);
        if (cancelled) return;
        setConversations([created]);
        setActiveConversationId(created.id);
        setMessages([WELCOME_MESSAGE]);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMessages([
            {
              id: createId(),
              role: 'assistant',
              content: 'No se pudo cargar el historial del asistente.',
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setConversationsLoading(false);
          setProfileLoading(false);
        }
      }
    }

    void bootstrap(token, rid);
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, restaurantId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
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
    scrollToBottom(streamingMessageId ? 'auto' : 'smooth');
  }, [messages, streamingMessageId, pendingAttachments, agentActivity, scrollToBottom]);

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
    async (outboundMessage: string, userMessage: ChatMessage) => {
      if (sendInFlightRef.current) return;

      const conversationId = activeConversationIdRef.current;
      const profile = assistantProfileRef.current;

      if (!accessToken || !restaurantId || !conversationId) {
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

      if (!profile?.chat_ready) {
        setIsBusy(false);
        return;
      }

      const assistantMessageId = createId();
      sendInFlightRef.current = true;
      setIsBusy(true);
      setAgentProcessing(true);
      setAgentActivity(INITIAL_AGENT_ACTIVITY);
      setMessages((prev) => {
        const withoutWelcome =
          prev.length === 1 && prev[0]?.id === 'welcome' ? [] : prev.filter((m) => m.id !== 'welcome');
        return [
          ...withoutWelcome,
          userMessage,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ];
      });
      setStreamingMessageId(assistantMessageId);

      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

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

      const profileSnapshot = {
        display_name: profile.display_name,
        enabled_skill_ids: profile.enabled_skill_ids,
      };

      try {
        await streamAssistantChat(
          accessToken,
          restaurantId,
          conversationId,
          outboundMessage,
          {
            onDelta: (delta) => {
              setAgentProcessing(false);
              streamedContent += delta;
              if (pendingFrame === null) {
                pendingFrame = requestAnimationFrame(flushStreamedContent);
              }
            },
            onAgentPhase: (phase) => {
              setAgentActivity((prev) => ({ ...prev, phase }));
            },
            onAgentStatus: (status) => {
              setAgentActivity((prev) => ({ ...prev, status }));
              if (status === 'processing') {
                setAgentProcessing(true);
              }
            },
            onToolStart: (payload) => {
              setAgentProcessing(true);
              setAgentActivity((prev) => ({
                ...prev,
                phase: prev.phase ?? 'explore',
                status: 'processing',
                tools: [
                  ...prev.tools,
                  {
                    id: createToolStepId(payload.tool),
                    tool: payload.tool,
                    skillId: payload.skill_id,
                    status: 'running',
                  },
                ],
              }));
            },
            onToolResult: (payload) => {
              setAgentActivity((prev) => ({
                ...prev,
                tools: prev.tools.map((step) =>
                  step.tool === payload.tool && step.status === 'running'
                    ? {
                        ...step,
                        status: 'done',
                        summary: payload.summary,
                      }
                    : step,
                ),
              }));
            },
            onToolError: (payload) => {
              setAgentActivity((prev) => ({
                ...prev,
                tools: prev.tools.map((step) =>
                  step.tool === payload.tool && step.status === 'running'
                    ? {
                        ...step,
                        status: 'error',
                        summary: payload.summary,
                      }
                    : step,
                ),
              }));
            },
            onComplete: (payload) => {
              const finalContent = payload.content || streamedContent;
              const resolvedAssistantId = payload.message_id || assistantMessageId;
              const resolvedUserId = userMessage.id;
              setMessages((prev) =>
                prev.map((message) => {
                  if (message.id === assistantMessageId) {
                    return { ...message, id: resolvedAssistantId, content: finalContent };
                  }
                  if (message.id === userMessage.id) {
                    return { ...message, id: resolvedUserId };
                  }
                  return message;
                }),
              );
              void refreshConversations();
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
          {
            profileVersion: profile.version,
            profileSnapshot,
          },
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
    [accessToken, restaurantId, refreshConversations],
  );

  const saveAssistantName = useCallback(async () => {
    const name = assistantNameDraft.trim();
    if (!accessToken || !restaurantId || !assistantProfile || !name) return;

    try {
      const updated = await updateAssistantProfile(accessToken, restaurantId, {
        display_name: name,
        expected_version: assistantProfile.version,
      });
      setAssistantProfile(updated);
      setAssistantNameDraft(updated.display_name);
    } catch (error) {
      console.error(error);
    }
  }, [accessToken, assistantNameDraft, assistantProfile, restaurantId]);

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

      setDraft('');
      setPendingAttachments([]);
      await requestAssistantReply(outboundMessage, userMessage);
    },
    [isBusy, requestAssistantReply],
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

      setMessages((prev) => [...prev, userMessage]);
      await requestAssistantReply(summary, userMessage);
    },
    [isBusy, messages, requestAssistantReply],
  );

  const handleNewConversation = async () => {
    if (!accessToken || !restaurantId || isBusy) return;

    streamAbortRef.current?.abort();
    sendInFlightRef.current = false;
    clearPendingAttachments();
    setDraft('');
    setStreamingMessageId(null);
    setIsBusy(false);
    setIsDragActive(false);
    dragCounterRef.current = 0;

    try {
      const created = await createAssistantConversation(accessToken, restaurantId);
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([WELCOME_MESSAGE]);
    } catch (error) {
      console.error(error);
    }
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

  const canSend =
    !isBusy &&
    assistantProfile?.chat_ready &&
    (draft.trim().length > 0 || pendingAttachments.length > 0);

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

      <AssistantConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={conversationsLoading}
        disabled={isBusy}
        onSelect={(conversationId) => {
          void selectConversation(conversationId);
        }}
      />

      <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
        {messagesLoading ? (
          <p className={styles.messagesLoading}>Cargando mensajes…</p>
        ) : null}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const isStreaming = streamingMessageId === message.id;
          const isAwaitingFirstToken =
            isStreaming && message.content.trim().length === 0 && agentProcessing;
          const showAgentActivity = isStreaming && (
            agentActivity.phase !== null ||
            agentActivity.tools.length > 0 ||
            agentActivity.status === 'processing'
          );
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
                <div
                  className={`${styles.messageAvatar} ${isAwaitingFirstToken ? styles.messageAvatarAwaiting : ''}`}
                  aria-hidden
                >
                  <BrainOutlinedIcon fontSize="inherit" />
                </div>
              ) : null}
              <div
                className={`${styles.messageContent} ${isUser ? styles.messageContentUser : styles.messageContentAssistant}`}
              >
                {(message.content || hasAttachments || isStreaming) && (
                  <div
                    className={`${styles.messageBody} ${isUser ? styles.messageBodyUser : styles.messageBodyAssistant} ${
                      attachmentsOnly ? styles.messageBodyAttachmentsOnly : ''
                    } ${isAttachmentPair ? styles.messageBodyAttachmentPair : ''}`}
                  >
                    {isUser ? (
                      message.content ? (
                        <p className={styles.userText}>{message.content}</p>
                      ) : null
                    ) : (
                      <div className={styles.assistantText}>
                        {showAgentActivity ? (
                          <ChatAgentActivity
                            activity={agentActivity}
                            showProcessingDots={isAwaitingFirstToken}
                          />
                        ) : null}
                        {isAwaitingFirstToken && !showAgentActivity ? (
                          <ChatStreamProcessing />
                        ) : null}
                        {message.content ? (
                          isStreaming ? (
                            <p className={styles.streamingText}>{message.content}</p>
                          ) : (
                            <ChatMarkdown content={message.content} />
                          )
                        ) : null}
                        {isStreaming && message.content ? (
                          <span className={styles.cursor} aria-hidden />
                        ) : null}
                      </div>
                    )}
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

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.composer}>
        {!profileLoading && assistantProfile && !assistantProfile.chat_ready ? (
          <div className={styles.profileOnboarding}>
            <p className={styles.profileOnboardingText}>
              Antes de chatear, elige un nombre para tu asistente.
            </p>
            <div className={styles.profileOnboardingRow}>
              <input
                type="text"
                className={styles.profileNameInput}
                value={assistantNameDraft}
                maxLength={80}
                placeholder="Ej. Luna, Marco…"
                onChange={(event) => setAssistantNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void saveAssistantName();
                  }
                }}
              />
              <button
                type="button"
                className={styles.profileSaveButton}
                disabled={!assistantNameDraft.trim() || isBusy}
                onClick={() => {
                  void saveAssistantName();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestionChip}
              disabled={isBusy || !assistantProfile?.chat_ready}
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
            disabled={isBusy || !assistantProfile?.chat_ready}
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
