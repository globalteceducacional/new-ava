'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';

type Question = {
  id: string;
  type: string;
  text: string;
  options: Array<{ id: string; text: string }>;
};

type Quiz = {
  id: string;
  title: string;
  questions: Question[];
};

export default function AlunoQuizPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; maxScore: number; percent: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<Quiz>(`/quizzes/${params.id}`);
        setQuiz(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar quiz');
      }
    })();
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quiz) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await apiFetch<{ id: string }>(`/quizzes/${quiz.id}/attempts`, {
        method: 'POST',
      });
      const payload = {
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          selectedOptionIds: answers[q.id] ? [answers[q.id]] : [],
        })),
      };
      const finished = await apiFetch<{
        score: number;
        maxScore: number;
        percent: number;
      }>(`/attempts/${attempt.id}/finish`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(finished);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={quiz?.title ?? 'Quiz'}>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {result ? (
        <div className="alert alert-info">
          Nota: <strong>{result.score}</strong> / {result.maxScore} ({result.percent}%)
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => router.back()}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : quiz ? (
        <form onSubmit={onSubmit}>
          {quiz.questions.map((q, idx) => (
            <div key={q.id} className="panel" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <p className="eyebrow">Questão {idx + 1}</p>
              <h3>{q.text}</h3>
              {q.options.map((o) => (
                <label
                  key={o.id}
                  className="checkbox-row"
                  style={{ display: 'block', marginTop: 8 }}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={o.id}
                    checked={answers[q.id] === o.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                  />{' '}
                  {o.text}
                </label>
              ))}
            </div>
          ))}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Finalizar'}
          </button>
        </form>
      ) : (
        <p className="muted">Carregando…</p>
      )}
    </AppShell>
  );
}
