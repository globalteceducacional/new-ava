import { QuestionType } from '@prisma/client';

export type GradeableQuestion = {
  id: string;
  type: QuestionType;
  points: number;
  answerKey: unknown;
  options: Array<{ id: string; isCorrect: boolean }>;
};

export type StudentAnswerInput = {
  questionId: string;
  selectedOptionIds?: string[];
  value?: string | null;
};

export type GradedAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  value: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number;
  pending: boolean;
};

export type GradeResult = {
  score: number;
  maxScore: number;
  pendingEssay: boolean;
  answers: GradedAnswer[];
};

export function gradeQuizAttempt(
  questions: GradeableQuestion[],
  answers: StudentAnswerInput[],
): GradeResult {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let maxScore = 0;
  let pendingEssay = false;
  const graded: GradedAnswer[] = [];

  for (const q of questions) {
    maxScore += q.points;
    const ans = byId.get(q.id);
    const selected = ans?.selectedOptionIds ?? [];
    const value = ans?.value ?? null;

    if (q.type === QuestionType.ESSAY) {
      pendingEssay = true;
      graded.push({
        questionId: q.id,
        selectedOptionIds: selected,
        value,
        isCorrect: null,
        pointsAwarded: 0,
        pending: true,
      });
      continue;
    }

    let correct = false;
    if (q.type === QuestionType.MCQ || q.type === QuestionType.TF) {
      const correctIds = q.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id)
        .sort();
      const chosen = [...selected].sort();
      correct =
        correctIds.length > 0 &&
        correctIds.length === chosen.length &&
        correctIds.every((id, i) => id === chosen[i]);
    } else if (q.type === QuestionType.NUMERIC) {
      const expected = Number(
        typeof q.answerKey === 'object' && q.answerKey && 'value' in q.answerKey
          ? (q.answerKey as { value: number }).value
          : q.answerKey,
      );
      correct =
        value !== null && !Number.isNaN(expected) && Number(value) === expected;
    } else if (q.type === QuestionType.MATCH) {
      correct =
        JSON.stringify(q.answerKey ?? null) ===
        JSON.stringify(safeParse(value));
    }

    const pointsAwarded = correct ? q.points : 0;
    score += pointsAwarded;
    graded.push({
      questionId: q.id,
      selectedOptionIds: selected,
      value,
      isCorrect: correct,
      pointsAwarded,
      pending: false,
    });
  }

  return {
    score: Math.round(score * 100) / 100,
    maxScore,
    pendingEssay,
    answers: graded,
  };
}

function safeParse(value: string | null): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
