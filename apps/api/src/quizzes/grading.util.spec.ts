import { QuestionType } from '@prisma/client';
import { gradeQuizAttempt } from './grading.util';

describe('gradeQuizAttempt', () => {
  const questions = [
    {
      id: 'q1',
      type: QuestionType.MCQ,
      points: 1,
      answerKey: null,
      options: [
        { id: 'a', isCorrect: true },
        { id: 'b', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      type: QuestionType.TF,
      points: 1,
      answerKey: null,
      options: [
        { id: 't', isCorrect: true },
        { id: 'f', isCorrect: false },
      ],
    },
    {
      id: 'q3',
      type: QuestionType.ESSAY,
      points: 2,
      answerKey: null,
      options: [],
    },
  ];

  it('calcula score objetivo e marca essay pending', () => {
    const result = gradeQuizAttempt(questions, [
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', selectedOptionIds: ['f'] },
      { questionId: 'q3', value: 'resposta longa' },
    ]);

    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(4);
    expect(result.pendingEssay).toBe(true);
    expect(result.answers.find((a) => a.questionId === 'q3')?.pending).toBe(
      true,
    );
  });
});
