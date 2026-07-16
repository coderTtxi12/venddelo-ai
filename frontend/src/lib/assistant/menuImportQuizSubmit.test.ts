import { describe, expect, it } from 'vitest';
import type { MenuImportQuizAnswers } from '@/components/assistant/MenuImportQuiz';
import type { MenuImportQuizPayload } from '@/lib/api/assistant';
import {
  areAllMenuImportQuizQuestionsAnswered,
  composeMenuImportUserTurn,
  findPendingMenuImportQuiz,
  formatMenuImportQuizSubmission,
  hasMenuImportQuizAnswers,
} from '@/lib/assistant/menuImportQuizSubmit';

const quiz: MenuImportQuizPayload = {
  questions: [
    {
      id: 'q_1',
      question: '¿Incluye bebida?',
      suggested_answers: [{ id: 'opt_1', label: 'Sí' }],
      allow_other: true,
    },
    {
      id: 'q_2',
      question: '¿Es por porción?',
      suggested_answers: [{ id: 'opt_1', label: 'Sí' }],
      allow_other: true,
    },
  ],
};

const answers: MenuImportQuizAnswers = {
  q_1: { optionId: 'opt_1', label: 'Sí' },
};

describe('menuImportQuizSubmit', () => {
  it('finds the latest unsubmitted quiz message', () => {
    const pending = findPendingMenuImportQuiz([
      { id: 'a1', role: 'assistant', menuImportQuizSubmitted: true, menuImportQuiz: quiz },
      { id: 'a2', role: 'assistant', menuImportQuiz: quiz },
    ]);

    expect(pending?.messageId).toBe('a2');
  });

  it('formats only answered questions by default', () => {
    const rendered = formatMenuImportQuizSubmission(quiz, answers);

    expect(rendered).toContain('Respuestas de aclaración del menú:');
    expect(rendered).toContain('¿Incluye bebida?');
    expect(rendered).not.toContain('¿Es por porción?');
  });

  it('composes quiz block before extra user text', () => {
    const rendered = composeMenuImportUserTurn(
      'para Bolas de helado agrega Chocolate, Fresa, Vainilla',
      quiz,
      answers,
    );

    expect(rendered.indexOf('Respuestas de aclaración del menú:')).toBeLessThan(
      rendered.indexOf('Bolas de helado'),
    );
    expect(rendered).toContain('Chocolate, Fresa, Vainilla');
  });

  it('returns only extra text when there are no quiz answers', () => {
    expect(composeMenuImportUserTurn('solo texto', quiz, {})).toBe('solo texto');
    expect(hasMenuImportQuizAnswers({})).toBe(false);
  });

  it('detects when every quiz question is answered', () => {
    expect(areAllMenuImportQuizQuestionsAnswered(quiz, answers)).toBe(false);
    expect(
      areAllMenuImportQuizQuestionsAnswered(quiz, {
        ...answers,
        q_2: { optionId: 'opt_1', label: 'No' },
      }),
    ).toBe(true);
  });
});
