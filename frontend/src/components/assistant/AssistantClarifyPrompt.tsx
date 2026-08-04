'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AssistantClarifyPayload } from '@/lib/api/assistant';
import styles from './AssistantClarifyPrompt.module.css';

type AssistantClarifyPromptProps = {
  payload: AssistantClarifyPayload;
  submitted?: boolean;
  closedReason?: string | null;
  onSubmit: (userResponse: string | string[]) => void | Promise<void>;
};

const OTHER_VALUE = '__other__';

const CLOSED_REASON_MESSAGES: Record<string, string> = {
  timeout: 'Se agotó el tiempo para responder.',
  cancelled: 'Esta pregunta ya no está activa.',
  superseded: 'Esta pregunta ya no está activa.',
};

function formatSubmittedAnswer(response: string | string[]): string {
  if (Array.isArray(response)) {
    return response.map((item) => item.trim()).filter(Boolean).join(', ');
  }
  return response.trim();
}

export default function AssistantClarifyPrompt({
  payload,
  submitted = false,
  closedReason = null,
  onSubmit,
}: AssistantClarifyPromptProps) {
  const { question, choices, multi_select: multiSelect } = payload;
  const isOpenEnded = choices === null;
  const showOtherOption = !isOpenEnded;
  const otherInputId = useId();
  const openInputId = useId();
  const openInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const [openText, setOpenText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [isOtherActive, setIsOtherActive] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);

  const answeredLocally = localAnswer !== null;
  const isClosed = submitted || answeredLocally || Boolean(closedReason);
  const isLocked = isClosed || submitting;
  const otherSelected = multiSelect ? isOtherActive : selected === OTHER_VALUE;
  const showSuccess = submitted || answeredLocally || closedReason === 'answered';

  const canSubmit = (() => {
    if (isLocked) return false;
    if (isOpenEnded) return openText.trim().length > 0;
    if (!multiSelect) {
      if (selected === OTHER_VALUE) return otherText.trim().length > 0;
      return Boolean(selected);
    }
    if (selectedSet.size > 0) return true;
    return isOtherActive && otherText.trim().length > 0;
  })();

  useEffect(() => {
    if (isLocked) return;
    if (isOpenEnded) {
      openInputRef.current?.focus();
      return;
    }
    if (otherSelected) {
      otherInputRef.current?.focus();
    }
  }, [isLocked, isOpenEnded, otherSelected]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;

    let response: string | string[];
    if (isOpenEnded) {
      response = openText.trim();
    } else if (!multiSelect) {
      response = selected === OTHER_VALUE ? otherText.trim() : (selected ?? '');
    } else {
      const values = Array.from(selectedSet);
      if (isOtherActive && otherText.trim()) {
        values.push(otherText.trim());
      }
      response = values;
    }

    const answerLabel = formatSubmittedAnswer(response);
    if (!answerLabel) return;

    setSubmitting(true);
    setError(null);
    // Collapse the interactive form immediately so streaming re-renders
    // cannot thrash focus on the "Otro" input (felt like a UI freeze).
    setLocalAnswer(answerLabel);
    try {
      await onSubmit(response);
    } catch {
      setLocalAnswer(null);
      setError('No se pudo enviar tu respuesta. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const selectSingleChoice = (choice: string) => {
    if (isLocked) return;
    setSelected(choice);
  };

  const toggleMultiChoice = (choice: string) => {
    if (isLocked) return;
    setSelectedSet((current) => {
      const next = new Set(current);
      if (next.has(choice)) {
        next.delete(choice);
      } else {
        next.add(choice);
      }
      return next;
    });
  };

  const selectOther = () => {
    if (isLocked) return;
    if (multiSelect) {
      setIsOtherActive((current) => !current);
    } else {
      setSelected(OTHER_VALUE);
    }
  };

  if (showSuccess) {
    return (
      <div className={`${styles.prompt} ${styles.promptSettled}`} role="status">
        <p className={styles.statusNote}>
          {localAnswer ? `Respuesta enviada: ${localAnswer}` : 'Respuesta enviada'}
        </p>
      </div>
    );
  }

  if (closedReason) {
    return (
      <div className={`${styles.prompt} ${styles.promptSettled}`} role="status">
        <p className={styles.statusNote}>
          {CLOSED_REASON_MESSAGES[closedReason] ?? 'Esta pregunta ya no está activa.'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.prompt} role="form" aria-label="Pregunta del asistente">
      <p className={styles.question}>{question}</p>

      {isOpenEnded ? (
        <div className={styles.field}>
          <label htmlFor={openInputId} className={styles.srOnly}>
            Tu respuesta
          </label>
          <input
            ref={openInputRef}
            id={openInputId}
            type="text"
            className={styles.textInput}
            value={openText}
            placeholder="Escribe tu respuesta…"
            onChange={(event) => setOpenText(event.target.value)}
            onKeyDown={handleEnterKey}
            disabled={isLocked}
          />
        </div>
      ) : (
        <div
          className={styles.options}
          role={multiSelect ? 'group' : 'radiogroup'}
          aria-label={question}
        >
          {choices!.map((choice) => {
            const isSelected = multiSelect ? selectedSet.has(choice) : selected === choice;
            return (
              <button
                key={choice}
                type="button"
                role={multiSelect ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                className={`${styles.optionRow} ${isSelected ? styles.optionRowSelected : ''}`}
                onClick={() => (multiSelect ? toggleMultiChoice(choice) : selectSingleChoice(choice))}
                disabled={isLocked}
              >
                <span
                  className={multiSelect ? styles.optionCheckbox : styles.optionRadio}
                  aria-hidden
                />
                <span className={styles.optionLabel}>{choice}</span>
              </button>
            );
          })}

          {showOtherOption ? (
            <button
              type="button"
              role={multiSelect ? 'checkbox' : 'radio'}
              aria-checked={otherSelected}
              className={`${styles.optionRow} ${otherSelected ? styles.optionRowSelected : ''}`}
              onClick={selectOther}
              disabled={isLocked}
            >
              <span
                className={multiSelect ? styles.optionCheckbox : styles.optionRadio}
                aria-hidden
              />
              <span className={styles.optionLabel}>Otro (escribe tu respuesta)</span>
            </button>
          ) : null}
        </div>
      )}

      {!isOpenEnded && otherSelected ? (
        <div className={styles.field}>
          <label htmlFor={otherInputId} className={styles.srOnly}>
            Otra respuesta
          </label>
          <input
            ref={otherInputRef}
            id={otherInputId}
            type="text"
            className={styles.textInput}
            value={otherText}
            placeholder="Escribe tu respuesta…"
            onChange={(event) => setOtherText(event.target.value)}
            onKeyDown={handleEnterKey}
            disabled={isLocked}
          />
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.submitButton}
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          aria-busy={submitting}
        >
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
