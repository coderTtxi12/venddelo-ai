import type { MenuImportQuizPayload } from '@/lib/api/assistant';
import type { MenuImportQuizAnswers } from '@/components/assistant/MenuImportQuiz';

export const MENU_IMPORT_QUIZ_SUBMISSION_PREFIX = 'Respuestas de aclaración del menú:';

export type PendingMenuImportQuiz = {
  messageId: string;
  quiz: MenuImportQuizPayload;
};

type ChatMessageLike = {
  id: string;
  role: 'user' | 'assistant';
  menuImportQuiz?: MenuImportQuizPayload | null;
  menuImportQuizSubmitted?: boolean;
};

export function hasMenuImportQuizAnswers(answers: MenuImportQuizAnswers): boolean {
  return Object.values(answers).some((answer) => answer.label.trim().length > 0);
}

export function areAllMenuImportQuizQuestionsAnswered(
  quiz: MenuImportQuizPayload,
  answers: MenuImportQuizAnswers,
): boolean {
  return quiz.questions.every(
    (question) => (answers[question.id]?.label?.trim().length ?? 0) > 0,
  );
}

export function findPendingMenuImportQuiz(
  messages: ChatMessageLike[],
): PendingMenuImportQuiz | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role === 'assistant' &&
      message.menuImportQuiz?.questions.length &&
      !message.menuImportQuizSubmitted
    ) {
      return { messageId: message.id, quiz: message.menuImportQuiz };
    }
  }
  return null;
}

export function formatMenuImportQuizSubmission(
  quiz: MenuImportQuizPayload,
  answers: MenuImportQuizAnswers,
  options?: { includeUnanswered?: boolean },
): string {
  const lines = quiz.questions.flatMap((question, index) => {
    const label = answers[question.id]?.label?.trim() || '';
    if (!label && !options?.includeUnanswered) {
      return [];
    }
    return [`${index + 1}. ${question.question} → ${label || '(sin respuesta)'}`];
  });
  if (lines.length === 0) {
    return '';
  }
  return [MENU_IMPORT_QUIZ_SUBMISSION_PREFIX, ...lines].join('\n');
}

export function composeMenuImportUserTurn(
  extraText: string,
  quiz: MenuImportQuizPayload | null | undefined,
  answers: MenuImportQuizAnswers | null | undefined,
): string {
  const extra = extraText.trim();
  if (!quiz || !answers || !hasMenuImportQuizAnswers(answers)) {
    return extra;
  }
  const quizBlock = formatMenuImportQuizSubmission(quiz, answers);
  if (!quizBlock) {
    return extra;
  }
  if (extra) {
    return `${quizBlock}\n\n${extra}`;
  }
  return quizBlock;
}
