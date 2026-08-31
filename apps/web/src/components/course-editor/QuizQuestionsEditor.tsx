'use client';

import type { QuizQuestionDraft } from '@/lib/course-editor/types';

export function emptyQuizQuestion(): QuizQuestionDraft {
  return {
    type: 'MCQ',
    text: '',
    points: 1,
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  };
}

type Props = {
  questions: QuizQuestionDraft[];
  onChange: (next: QuizQuestionDraft[]) => void;
  disabled?: boolean;
};

/** Formulário de questões do quiz (criar/editar). */
export function QuizQuestionsEditor({ questions, onChange, disabled = false }: Props) {
  function updateAt(index: number, patch: Partial<QuizQuestionDraft>) {
    onChange(questions.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function setType(index: number, type: QuizQuestionDraft['type']) {
    const current = questions[index];
    if (!current) return;
    if (type === 'TF') {
      updateAt(index, {
        type,
        options: [
          { text: 'Verdadeiro', isCorrect: true },
          { text: 'Falso', isCorrect: false },
        ],
      });
      return;
    }
    if (type === 'ESSAY') {
      updateAt(index, { type, options: [] });
      return;
    }
    updateAt(index, {
      type,
      options: current.options.length >= 2 ? current.options : emptyQuizQuestion().options,
    });
  }

  return (
    <div className="quiz-questions-editor">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Perguntas</strong>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => onChange([...questions, emptyQuizQuestion()])}
        >
          + Questão
        </button>
      </div>
      <p className="small muted" style={{ margin: '0.35rem 0 0.75rem' }}>
        Marque a opção correta com o botão à esquerda. Em dissertativa não há alternativas.
      </p>

      {questions.map((q, qi) => (
        <div key={q.id ?? `new-${qi}`} className="question-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Questão {qi + 1}</strong>
            {questions.length > 1 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled}
                onClick={() => onChange(questions.filter((_, i) => i !== qi))}
              >
                Remover
              </button>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor={`qq-text-${qi}`}>Enunciado</label>
            <input
              id={`qq-text-${qi}`}
              value={q.text}
              disabled={disabled}
              onChange={(e) => updateAt(qi, { text: e.target.value })}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={`qq-type-${qi}`}>Tipo</label>
            <select
              id={`qq-type-${qi}`}
              value={q.type}
              disabled={disabled}
              onChange={(e) => setType(qi, e.target.value as QuizQuestionDraft['type'])}
            >
              <option value="MCQ">Múltipla escolha</option>
              <option value="TF">Verdadeiro / Falso</option>
              <option value="ESSAY">Dissertativa</option>
            </select>
          </div>

          {(q.type === 'MCQ' || q.type === 'TF') &&
            q.options.map((opt, oi) => (
              <div key={oi} className="option-row">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={opt.isCorrect}
                  disabled={disabled}
                  onChange={() =>
                    updateAt(qi, {
                      options: q.options.map((o, j) => ({
                        ...o,
                        isCorrect: j === oi,
                      })),
                    })
                  }
                  aria-label="Resposta correta"
                />
                <input
                  type="text"
                  value={opt.text}
                  disabled={disabled || q.type === 'TF'}
                  placeholder={`Opção ${oi + 1}`}
                  onChange={(e) =>
                    updateAt(qi, {
                      options: q.options.map((o, j) =>
                        j === oi ? { ...o, text: e.target.value } : o,
                      ),
                    })
                  }
                  required
                />
              </div>
            ))}

          {q.type === 'MCQ' ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled}
              onClick={() =>
                updateAt(qi, {
                  options: [...q.options, { text: '', isCorrect: false }],
                })
              }
            >
              + Opção
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Payload de questões para a API de create/update. */
export function serializeQuizQuestions(questions: QuizQuestionDraft[]) {
  return questions.map((q) => ({
    type: q.type,
    text: q.text,
    points: q.points,
    options:
      q.type === 'MCQ' || q.type === 'TF' ? q.options.filter((o) => o.text.trim()) : undefined,
  }));
}
