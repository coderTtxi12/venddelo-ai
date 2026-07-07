'use client';

import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BrainOutlinedIcon from '@/components/icons/BrainOutlinedIcon';
import ChatMarkdown from '@/components/assistant/ChatMarkdown';
import AssistantWorkflowTelemetry from '@/components/assistant/AssistantWorkflowTelemetry';
import { useAssistantChat } from '@/contexts/AssistantChatContext';
import { useRestaurantOrders } from '@/contexts/RestaurantOrdersContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatPanelResize } from '@/hooks/useChatPanelResize';
import { streamAssistantChat } from '@/lib/api/assistant';
import {
  INITIAL_WORKFLOW_TELEMETRY,
  applyWorkflowEvaluation,
  applyWorkflowPhase,
  applyWorkflowPlan,
  applyWorkflowStep,
  markWorkflowStreaming,
  type WorkflowTelemetryState,
} from '@/lib/assistant/workflowTelemetry';
import {
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
} from '@/lib/assistant/chatPanelWidth';
import { ApiError } from '@/lib/api/types';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './AssistantChatPanel.module.css';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! Soy el asistente de tu restaurante. Por ahora puedo consultar tu menú: categorías, productos y promociones. ¿Qué te gustaría revisar?',
};

const SUGGESTIONS = [
  '¿Qué categorías tengo?',
  'Buscar un producto por nombre',
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
  const [isBusy, setIsBusy] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [agentProcessing, setAgentProcessing] = useState(false);
  const [workflowTelemetry, setWorkflowTelemetry] = useState<WorkflowTelemetryState>(
    INITIAL_WORKFLOW_TELEMETRY,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    return () => {
      streamAbortRef.current?.abort();
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

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isBusy || sendInFlightRef.current) return;

      if (!accessToken || !restaurantId) {
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

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
      };
      const assistantMessageId = createId();

      streamAbortRef.current?.abort();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      sendInFlightRef.current = true;
      setIsBusy(true);
      setStreamingMessageId(assistantMessageId);
      setAgentProcessing(true);
      setWorkflowTelemetry(INITIAL_WORKFLOW_TELEMETRY);
      setDraft('');
      setMessages((prev) => {
        const withoutWelcome =
          prev.length === 1 && prev[0]?.id === 'welcome'
            ? []
            : prev.filter((message) => message.id !== 'welcome');
        return [
          ...withoutWelcome,
          userMessage,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ];
      });

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
        setWorkflowTelemetry(INITIAL_WORKFLOW_TELEMETRY);
      };

      try {
        await streamAssistantChat(
          accessToken,
          restaurantId,
          {
            message: text,
            conversation_id: conversationId,
          },
          {
            onDelta: (delta) => {
              streamedContent += delta;
              setAgentProcessing(false);
              setWorkflowTelemetry((current) => markWorkflowStreaming(current));
              if (pendingFrame === null) {
                pendingFrame = requestAnimationFrame(flushStreamedContent);
              }
            },
            onAgentStatus: (status) => {
              if (status === 'processing') {
                setAgentProcessing(true);
              }
            },
            onAgentPhase: ({ phase }) => {
              setAgentProcessing(true);
              setWorkflowTelemetry((current) => applyWorkflowPhase(current, phase));
            },
            onAgentPlan: (payload) => {
              setAgentProcessing(true);
              setWorkflowTelemetry((current) => applyWorkflowPlan(current, payload));
            },
            onAgentStep: (payload) => {
              setWorkflowTelemetry((current) =>
                applyWorkflowStep(current, {
                  step_id: payload.step_id,
                  status: payload.status,
                  goal: payload.goal,
                  tool_hint: payload.tool_hint,
                }),
              );
            },
            onAgentEvaluation: (payload) => {
              setWorkflowTelemetry((current) =>
                applyWorkflowEvaluation(current, {
                  ok: payload.ok,
                  shouldReplan: payload.should_replan,
                  issues: payload.issues,
                }),
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
                    ? { ...message, content: finalContent }
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
    [accessToken, conversationId, isBusy, restaurantId],
  );

  const handleSubmit = () => {
    if (isBusy || sendInFlightRef.current) return;
    void sendMessage(draft);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleNewConversation = () => {
    if (isBusy) return;
    streamAbortRef.current?.abort();
    setConversationId(null);
    setDraft('');
    setStreamingMessageId(null);
    setAgentProcessing(false);
    setWorkflowTelemetry(INITIAL_WORKFLOW_TELEMETRY);
    setMessages([WELCOME_MESSAGE]);
    textareaRef.current?.focus();
  };

  const canSend = !isBusy && draft.trim().length > 0;

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

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.avatar} aria-hidden>
            <BrainOutlinedIcon fontSize="inherit" />
          </div>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Asistente</h2>
            <p className={styles.subtitle}>Consulta tu menú con IA</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.modeBadge}>Solo lectura</span>
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
          const showWorkflowTelemetry =
            isStreaming &&
            (agentProcessing ||
              workflowTelemetry.activePhase !== null ||
              workflowTelemetry.steps.length > 0);

          if (!isUser && !message.content && !isStreaming) {
            return null;
          }

          return (
            <div
              key={message.id}
              className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}
            >
              {!isUser ? (
                <div
                  className={`${styles.messageAvatar} ${showWorkflowTelemetry && !message.content ? styles.messageAvatarAwaiting : ''}`}
                  aria-hidden
                >
                  <BrainOutlinedIcon fontSize="inherit" />
                </div>
              ) : null}
              <div
                className={`${styles.messageContent} ${isUser ? styles.messageContentUser : styles.messageContentAssistant}`}
              >
                <div
                  className={`${styles.messageBody} ${isUser ? styles.messageBodyUser : styles.messageBodyAssistant}`}
                >
                  {isUser ? (
                    <p className={styles.userText}>{message.content}</p>
                  ) : (
                    <div className={styles.assistantText}>
                      {showWorkflowTelemetry ? (
                        <AssistantWorkflowTelemetry
                          telemetry={workflowTelemetry}
                          showPhaseRail={!workflowTelemetry.isStreamingResponse}
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

        <div className={styles.inputRow}>
          <label htmlFor="assistant-chat-input" className={styles.srOnly}>
            Mensaje para el asistente
          </label>
          <textarea
            ref={textareaRef}
            id="assistant-chat-input"
            className={styles.textarea}
            rows={1}
            placeholder="Pregunta sobre categorías, productos o promociones…"
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

        <p className={styles.hint}>Enter para enviar · Shift+Enter para nueva línea</p>
      </div>
    </aside>
  );
}
