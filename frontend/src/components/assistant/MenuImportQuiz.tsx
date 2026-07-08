'use client';

import { useState } from 'react';
import type { MenuImportQuizQuestion } from '@/lib/api/assistant';
import styles from './MenuImportQuiz.module.css';

export type MenuImportQuizAnswer = {
  optionId?: string;
  label: string;
  isOther?: boolean;
};

export type MenuImportQuizAnswers = Record<string, MenuImportQuizAnswer>;

type MenuImportQuizProps = {
  questions: MenuImportQuizQuestion[];
  disabled?: boolean;
  submitted?: boolean;
  onSubmit: (answers: MenuImportQuizAnswers) => void;
};

const OTHER_OPTION_ID = '__other__';
const OTHER_LABEL_PATTERN = /^(otro|otra|other|personalizado|custom)$/i;

function isOtherSuggestedLabel(label: string): boolean {
  return OTHER_LABEL_PATTERN.test(label.trim());
}

function visibleSuggestions(question: MenuImportQuizQuestion) {
  const seen = new Set<string>();
  return question.suggested_answers.filter((option) => {
    if (question.allow_other !== false && isOtherSuggestedLabel(option.label)) {
      return false;
    }
    const key = option.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isQuestionAnswered(
  question: MenuImportQuizQuestion,
  answers: MenuImportQuizAnswers,
): boolean {
  const answer = answers[question.id];
  if (!answer) return false;
  return answer.label.trim().length > 0;
}

export default function MenuImportQuiz({
  questions,
  disabled = false,
  submitted = false,
  onSubmit,
}: MenuImportQuizProps) {
  const [answers, setAnswers] = useState<MenuImportQuizAnswers>({});
  const [activeOtherId, setActiveOtherId] = useState<string | null>(null);

  const allAnswered = questions.every((question) => isQuestionAnswered(question, answers));
  const isLocked = disabled || submitted;

  const selectOption = (question: MenuImportQuizQuestion, optionId: string, label: string) => {
    if (isLocked) return;
    setActiveOtherId(null);
    setAnswers((current) => ({
      ...current,
      [question.id]: { optionId, label, isOther: false },
    }));
  };

  const selectOther = (questionId: string) => {
    if (isLocked) return;
    setActiveOtherId(questionId);
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        optionId: OTHER_OPTION_ID,
        label: current[questionId]?.isOther ? current[questionId].label : '',
        isOther: true,
      },
    }));
  };

  const updateOtherText = (questionId: string, text: string) => {
    if (isLocked) return;
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        optionId: OTHER_OPTION_ID,
        label: text,
        isOther: true,
      },
    }));
  };

  const handleSubmit = () => {
    if (!allAnswered || isLocked) return;
    onSubmit(answers);
  };

  return (
    <div className={styles.quiz} role="form" aria-label="Preguntas de aclaración del menú">
      <div className={styles.questionList}>
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const suggestions = visibleSuggestions(question);
          const showOtherInput =
            question.allow_other !== false &&
            (activeOtherId === question.id || answer?.isOther === true);

          return (
            <fieldset key={question.id} className={styles.questionBlock} disabled={isLocked}>
              <legend className={styles.questionPrompt}>
                <span className={styles.questionIndex}>{index + 1}</span>
                <span className={styles.questionText}>{question.question}</span>
              </legend>

              <div className={styles.options} role="radiogroup" aria-label={question.question}>
                {suggestions.map((option) => {
                  const selected = answer?.optionId === option.id && !answer.isOther;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`${styles.optionRow} ${selected ? styles.optionRowSelected : ''}`}
                      onClick={() => selectOption(question, option.id, option.label)}
                      disabled={isLocked}
                    >
                      <span className={styles.optionRadio} aria-hidden />
                      <span className={styles.optionLabel}>{option.label}</span>
                    </button>
                  );
                })}

                {question.allow_other !== false ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={answer?.isOther === true}
                    className={`${styles.optionRow} ${answer?.isOther ? styles.optionRowSelected : ''}`}
                    onClick={() => selectOther(question.id)}
                    disabled={isLocked}
                  >
                    <span className={styles.optionRadio} aria-hidden />
                    <span className={styles.optionLabel}>Otro</span>
                  </button>
                ) : null}
              </div>

              {showOtherInput ? (
                <label className={styles.otherField} htmlFor={`quiz-other-${question.id}`}>
                  <span className={styles.otherLabel}>Tu respuesta</span>
                  <input
                    id={`quiz-other-${question.id}`}
                    type="text"
                    className={styles.otherInput}
                    value={answer?.isOther ? answer.label : ''}
                    placeholder="Escribe tu respuesta…"
                    onChange={(event) => updateOtherText(question.id, event.target.value)}
                    disabled={isLocked}
                    autoFocus
                  />
                </label>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className={styles.footer}>
        {submitted ? (
          <p className={styles.submittedNote} role="status">
            Respuestas enviadas
          </p>
        ) : (
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={!allAnswered || isLocked}
          >
            Enviar respuestas
          </button>
        )}
      </div>
    </div>
  );
}
