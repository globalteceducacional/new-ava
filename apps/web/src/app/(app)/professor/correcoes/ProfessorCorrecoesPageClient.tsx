'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { errorMessage } from '@/lib/format';

type Course = { id: string; title: string };

type RubricCriterion = { key: string; label: string; weight: number };

type ActivityMeta = {
  id: string;
  title: string;
  description: string | null;
  rubric: RubricCriterion[] | null;
};

type QuizMeta = {
  id: string;
  title: string;
  description: string | null;
  graded: boolean;
};

type CorrectionKind = 'activity' | 'quiz';

type CorrectionItem = {
  kind: CorrectionKind;
  id: string;
  title: string;
};

type ActivitySubmission = {
  id: string;
  text: string | null;
  fileUrl: string | null;
  grade: number | null;
  feedback: string | null;
  rubricScores: Record<string, number> | null;
  submittedAt: string;
  gradedAt: string | null;
  student: { id: string; name: string; email: string };
};

type QuizAnswerRow = {
  questionId: string;
  questionText: string;
  questionType: string;
  points: number;
  value: string | null;
  selectedLabels: string[];
  correctLabels: string[];
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  pending: boolean;
};

type QuizAttemptRow = {
  id: string;
  score: number | null;
  maxScore: number | null;
  grade10: number | null;
  pendingEssay: boolean;
  finishedAt: string;
  corrected: boolean;
  student: { id: string; name: string; email: string };
  answers: QuizAnswerRow[];
};

type GradeFilter = 'all' | 'pending' | 'graded';

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function itemLabel(item: CorrectionItem): string {
  return item.kind === 'activity' ? `[Atividade] ${item.title}` : `[Questionário] ${item.title}`;
}

function defaultRubricScores(rubric: RubricCriterion[] | null | undefined): Record<string, number> {
  if (!rubric?.length) return { geral: 0 };
  return Object.fromEntries(rubric.map((c) => [c.key, 0]));
}

function questionTypeLabel(type: string): string {
  switch (type) {
    case 'MCQ':
      return 'Múltipla escolha';
    case 'TF':
      return 'Verdadeiro ou falso';
    case 'NUMERIC':
      return 'Numérica';
    case 'ESSAY':
      return 'Dissertativa';
    case 'MATCH':
      return 'Associação';
    default:
      return type;
  }
}

function formatActivityPrompt(title: string, description: string | null): string {
  const t = title.trim();
  const desc = description?.trim();
  if (desc && t && desc !== t) return `${t}\n\n${desc}`;
  if (desc) return desc;
  if (t) return t;
  return 'Enunciado não informado.';
}

function CorrectionPair(props: {
  question: string;
  answer: string | null;
  fileUrl?: string | null;
  questionLabel?: string;
  answerLabel?: string;
  emptyAnswerLabel?: string;
  footer?: ReactNode;
}) {
  return (
    <div className="correction-qa-stack">
      <div className="correction-answer-box correction-question-box">
        <p className="correction-answer-label">{props.questionLabel ?? 'Pergunta / enunciado'}</p>
        <p className="correction-answer-text">{props.question}</p>
      </div>
      <div className="correction-answer-box">
        <p className="correction-answer-label">{props.answerLabel ?? 'Resposta do aluno'}</p>
        {props.answer?.trim() ? (
          <p className="correction-answer-text">{props.answer}</p>
        ) : (
          <p className="correction-answer-empty">
            {props.emptyAnswerLabel ?? 'Sem texto enviado.'}
          </p>
        )}
        {props.fileUrl ? (
          <p className="correction-answer-file">
            <a href={props.fileUrl} target="_blank" rel="noreferrer">
              Abrir arquivo anexado
            </a>
          </p>
        ) : null}
        {props.footer}
      </div>
    </div>
  );
}

function QuizAnswersList(props: { answers: QuizAnswerRow[] }) {
  if (!props.answers.length) {
    return (
      <div className="correction-answer-box">
        <p className="correction-answer-empty">Nenhuma resposta registrada nesta tentativa.</p>
      </div>
    );
  }

  return (
    <div className="correction-quiz-answers">
      {props.answers.map((a, index) => {
        const answerText =
          a.questionType === 'ESSAY' || a.value?.trim()
            ? a.value?.trim() || '—'
            : a.selectedLabels.length
              ? a.selectedLabels.join(', ')
              : null;

        return (
          <div key={a.questionId} className="correction-quiz-answer-item">
            <CorrectionPair
              questionLabel={`Pergunta ${index + 1}`}
              question={a.questionText}
              answerLabel="Resposta do aluno"
              answer={answerText}
              emptyAnswerLabel="Sem resposta"
              footer={
                <div className="correction-quiz-meta small muted">
                  <span className="badge badge-brand">{questionTypeLabel(a.questionType)}</span>
                  {a.pending ? (
                    <span className="badge badge-warn">Aguardando correção manual</span>
                  ) : a.isCorrect === true ? (
                    <span className="badge badge-brand">Correta · {a.pointsAwarded ?? 0} pts</span>
                  ) : a.isCorrect === false ? (
                    <span className="badge badge-warn">Incorreta · {a.pointsAwarded ?? 0} pts</span>
                  ) : (
                    <span>{a.pointsAwarded ?? 0} pts</span>
                  )}
                  {a.questionType !== 'ESSAY' && a.correctLabels.length ? (
                    <span>Gabarito: {a.correctLabels.join(', ')}</span>
                  ) : null}
                </div>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export function ProfessorCorrecoesPageClient() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState<CorrectionItem[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [activityMeta, setActivityMeta] = useState<ActivityMeta | null>(null);
  const [quizMeta, setQuizMeta] = useState<QuizMeta | null>(null);
  const [activitySubs, setActivitySubs] = useState<ActivitySubmission[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRow[]>([]);
  const [filter, setFilter] = useState<GradeFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [draftFeedback, setDraftFeedback] = useState('');

  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    const [kind, id] = selectedKey.split(':') as [CorrectionKind, string];
    return items.find((i) => i.kind === kind && i.id === id) ?? null;
  }, [items, selectedKey]);

  const loadActivityRows = useCallback(async (activityId: string) => {
    const [meta, subs] = await Promise.all([
      apiFetch<ActivityMeta>(`/activities/${activityId}`),
      apiFetch<ActivitySubmission[]>(`/activities/${activityId}/submissions`),
    ]);
    setActivityMeta(meta);
    setActivitySubs(subs);
    setQuizAttempts([]);
  }, []);

  const loadQuizRows = useCallback(async (quizId: string) => {
    const [meta, rows] = await Promise.all([
      apiFetch<QuizMeta>(`/quizzes/${quizId}`),
      apiFetch<QuizAttemptRow[]>(`/quizzes/${quizId}/attempts`),
    ]);
    setQuizMeta(meta);
    setQuizAttempts(rows);
    setActivityMeta(null);
    setActivitySubs([]);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoadingCourses(true);
      try {
        const mine = await apiFetch<Course[]>('/courses/mine');
        setCourses(mine);
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar cursos'));
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!courseId) {
      setItems([]);
      setSelectedKey('');
      setActivitySubs([]);
      setQuizAttempts([]);
      setActivityMeta(null);
      setQuizMeta(null);
      return;
    }

    void (async () => {
      setLoadingItems(true);
      setSelectedKey('');
      setActivitySubs([]);
      setQuizAttempts([]);
      setActivityMeta(null);
      setQuizMeta(null);
      setError(null);
      try {
        const [activities, quizzes] = await Promise.all([
          apiFetch<ActivityMeta[]>(`/courses/${courseId}/activities`),
          apiFetch<QuizMeta[]>(`/courses/${courseId}/quizzes`),
        ]);
        const merged: CorrectionItem[] = [
          ...activities.map((a) => ({
            kind: 'activity' as const,
            id: a.id,
            title: a.title,
          })),
          ...quizzes.map((q) => ({
            kind: 'quiz' as const,
            id: q.id,
            title: q.title,
          })),
        ];
        setItems(merged);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar atividades'));
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    })();
  }, [courseId]);

  useEffect(() => {
    if (!selectedItem) return;

    void (async () => {
      setLoadingRows(true);
      setFilter('all');
      setDraftScores({});
      setDraftFeedback('');
      setError(null);
      try {
        if (selectedItem.kind === 'activity') {
          await loadActivityRows(selectedItem.id);
        } else {
          await loadQuizRows(selectedItem.id);
        }
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar entregas'));
      } finally {
        setLoadingRows(false);
      }
    })();
  }, [selectedItem, loadActivityRows, loadQuizRows]);

  const activityRows = useMemo(() => {
    return activitySubs.filter((s) => {
      const pending = s.grade == null;
      if (filter === 'pending') return pending;
      if (filter === 'graded') return !pending;
      return true;
    });
  }, [activitySubs, filter]);

  const quizRows = useMemo(() => {
    return quizAttempts.filter((row) => {
      const pending = !row.corrected;
      if (filter === 'pending') return pending;
      if (filter === 'graded') return row.corrected;
      return true;
    });
  }, [quizAttempts, filter]);

  const pendingCount = useMemo(() => {
    if (selectedItem?.kind === 'quiz') {
      return quizAttempts.filter((r) => !r.corrected).length;
    }
    if (selectedItem?.kind === 'activity') {
      return activitySubs.filter((s) => s.grade == null).length;
    }
    return 0;
  }, [selectedItem, activitySubs, quizAttempts]);

  const gradedCount = useMemo(() => {
    if (selectedItem?.kind === 'quiz') {
      return quizAttempts.filter((r) => r.corrected).length;
    }
    if (selectedItem?.kind === 'activity') {
      return activitySubs.filter((s) => s.grade != null).length;
    }
    return 0;
  }, [selectedItem, activitySubs, quizAttempts]);

  function openGradeForm(sub: ActivitySubmission) {
    const rubric = activityMeta?.rubric;
    const fromSub =
      sub.rubricScores && typeof sub.rubricScores === 'object'
        ? (sub.rubricScores as Record<string, number>)
        : null;
    setDraftScores(fromSub ?? defaultRubricScores(rubric));
    setDraftFeedback(sub.feedback ?? '');
    setBusyId(sub.id);
  }

  async function saveGrade(submissionId: string) {
    if (!activityMeta) return;
    setBusyId(submissionId);
    setError(null);
    try {
      await apiFetch(`/submissions/${submissionId}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({
          rubricScores: draftScores,
          feedback: draftFeedback.trim() || undefined,
        }),
      });
      await loadActivityRows(activityMeta.id);
      setBusyId(null);
      setDraftScores({});
      setDraftFeedback('');
    } catch (e) {
      setError(errorMessage(e, 'Falha ao salvar correção'));
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Correções">
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="page-header">
        <div>
          <p className="eyebrow">Docente</p>
          <h1>Correções</h1>
          <p className="muted">
            Escolha o curso e depois a atividade ou questionário. Expanda cada aluno para ver{' '}
            <strong>pergunta e resposta</strong>. Atividades de texto livre exigem correção manual;
            questionários objetivos recebem nota automática.
          </p>
        </div>
      </div>

      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label htmlFor="course-select">1. Curso</label>
            <select
              id="course-select"
              value={courseId}
              disabled={loadingCourses}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">Selecione o curso…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 280, flex: 1 }}>
            <label htmlFor="item-select">2. Atividade ou questionário</label>
            <select
              id="item-select"
              value={selectedKey}
              disabled={!courseId || loadingItems}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              <option value="">
                {loadingItems
                  ? 'Carregando…'
                  : !courseId
                    ? 'Selecione um curso primeiro'
                    : items.length === 0
                      ? 'Nenhuma atividade neste curso'
                      : 'Selecione…'}
              </option>
              {items.map((item) => (
                <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>
                  {itemLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedItem ? (
        <div className="empty-state">
          Selecione um curso e uma atividade ou questionário para ver as entregas dos alunos.
        </div>
      ) : null}

      {selectedItem ? (
        <>
          <div
            className="row"
            style={{
              gap: '0.5rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span className="badge badge-brand">
              {selectedItem.kind === 'activity' ? 'Correção manual' : 'Nota automática'}
            </span>
            <div className="row" style={{ gap: '0.35rem' }}>
              {(
                [
                  [
                    'all',
                    `Todas (${selectedItem.kind === 'activity' ? activitySubs.length : quizAttempts.length})`,
                  ],
                  ['pending', `Pendentes (${pendingCount})`],
                  ['graded', `Corrigidas (${gradedCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingRows ? (
            <p className="muted">Carregando entregas…</p>
          ) : selectedItem.kind === 'activity' ? (
            <ActivityCorrectionsTable
              key={`activity:${activityMeta?.id ?? ''}`}
              rows={activityRows}
              activityTitle={activityMeta?.title ?? ''}
              activityDescription={activityMeta?.description ?? null}
              rubric={activityMeta?.rubric ?? null}
              busyId={busyId}
              draftScores={draftScores}
              draftFeedback={draftFeedback}
              onOpenGrade={openGradeForm}
              onCancel={() => {
                setBusyId(null);
                setDraftScores({});
                setDraftFeedback('');
              }}
              onSave={(id) => void saveGrade(id)}
              onScoreChange={(key, value) => setDraftScores((prev) => ({ ...prev, [key]: value }))}
              onFeedbackChange={setDraftFeedback}
            />
          ) : (
            <QuizCorrectionsTable
              key={`quiz:${selectedItem.id}`}
              quizTitle={quizMeta?.title ?? selectedItem.title}
              quizDescription={quizMeta?.description ?? null}
              rows={quizRows}
            />
          )}
        </>
      ) : null}
    </AppShell>
  );
}

function ActivityCorrectionsTable(props: {
  rows: ActivitySubmission[];
  activityTitle: string;
  activityDescription: string | null;
  rubric: RubricCriterion[] | null;
  busyId: string | null;
  draftScores: Record<string, number>;
  draftFeedback: string;
  onOpenGrade: (sub: ActivitySubmission) => void;
  onCancel: () => void;
  onSave: (id: string) => void;
  onScoreChange: (key: string, value: number) => void;
  onFeedbackChange: (value: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openGrade(sub: ActivitySubmission) {
    setExpandedIds((prev) => new Set(prev).add(sub.id));
    props.onOpenGrade(sub);
  }

  const activityPrompt = formatActivityPrompt(props.activityTitle, props.activityDescription);

  if (!props.rows.length) {
    return (
      <div className="empty-state">
        Nenhuma entrega neste filtro. Alunos enviam respostas pela página da atividade.
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-body correction-item-intro">
        <p className="eyebrow" style={{ margin: '0 0 0.35rem' }}>
          Atividade selecionada
        </p>
        <h2 className="correction-item-title">{props.activityTitle || '—'}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Ao expandir cada aluno, compare o enunciado com a resposta entregue.
        </p>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Enviado em</th>
              <th>Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.rows.flatMap((s) => {
              const editing = props.busyId === s.id;
              const pending = s.grade == null;
              const expanded = expandedIds.has(s.id) || editing;
              const rows = [
                <tr key={s.id}>
                  <td>
                    <strong>{s.student.name}</strong>
                    <div className="small muted">{s.student.email}</div>
                  </td>
                  <td className="small muted">{formatDateTime(s.submittedAt)}</td>
                  <td>
                    {pending ? (
                      <span className="badge badge-warn">Pendente</span>
                    ) : (
                      <strong>{s.grade?.toFixed(1)}</strong>
                    )}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className={`correction-expand-btn${expanded ? ' is-open' : ''}`}
                        aria-expanded={expanded}
                        aria-label={
                          expanded ? 'Ocultar pergunta e resposta' : 'Ver pergunta e resposta'
                        }
                        title={expanded ? 'Ocultar pergunta e resposta' : 'Ver pergunta e resposta'}
                        onClick={() => toggleExpand(s.id)}
                      >
                        ▼
                      </button>
                      {pending && !editing ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openGrade(s)}
                        >
                          Corrigir
                        </button>
                      ) : null}
                      {!pending && !editing ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openGrade(s)}
                        >
                          Editar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>,
              ];

              if (expanded) {
                rows.push(
                  <tr key={`${s.id}-answer`}>
                    <td colSpan={4}>
                      <CorrectionPair
                        question={activityPrompt}
                        answer={s.text}
                        fileUrl={s.fileUrl}
                        questionLabel="Pergunta / enunciado"
                        answerLabel="Resposta do aluno"
                      />
                    </td>
                  </tr>,
                );
              }

              if (editing) {
                rows.push(
                  <tr key={`${s.id}-edit`}>
                    <td colSpan={4} style={{ background: 'var(--bg)' }}>
                      <div
                        style={{
                          display: 'grid',
                          gap: '0.75rem',
                          maxWidth: 560,
                          padding: '0.5rem 0',
                        }}
                      >
                        <p className="eyebrow" style={{ margin: 0 }}>
                          Avaliar entrega
                        </p>
                        {props.rubric?.length ? (
                          props.rubric.map((c) => (
                            <div className="field" key={c.key}>
                              <label htmlFor={`score-${s.id}-${c.key}`}>{c.label} (0–10)</label>
                              <input
                                id={`score-${s.id}-${c.key}`}
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                value={props.draftScores[c.key] ?? 0}
                                onChange={(e) => props.onScoreChange(c.key, Number(e.target.value))}
                              />
                            </div>
                          ))
                        ) : (
                          <div className="field" key="geral">
                            <label htmlFor={`score-${s.id}-geral`}>Nota (0–10)</label>
                            <input
                              id={`score-${s.id}-geral`}
                              type="number"
                              min={0}
                              max={10}
                              step={0.1}
                              value={props.draftScores.geral ?? 0}
                              onChange={(e) => props.onScoreChange('geral', Number(e.target.value))}
                            />
                          </div>
                        )}
                        <div className="field">
                          <label htmlFor={`feedback-${s.id}`}>Feedback (opcional)</label>
                          <textarea
                            id={`feedback-${s.id}`}
                            rows={3}
                            value={props.draftFeedback}
                            onChange={(e) => props.onFeedbackChange(e.target.value)}
                          />
                        </div>
                        <div className="row" style={{ gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => props.onSave(s.id)}
                          >
                            Salvar correção
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={props.onCancel}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>,
                );
              }

              if (!editing && expanded && s.feedback) {
                rows.push(
                  <tr key={`${s.id}-feedback`}>
                    <td colSpan={4} className="small muted">
                      Feedback: {s.feedback}
                    </td>
                  </tr>,
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuizCorrectionsTable(props: {
  quizTitle: string;
  quizDescription: string | null;
  rows: QuizAttemptRow[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!props.rows.length) {
    return (
      <div className="empty-state">
        Nenhuma tentativa finalizada neste filtro. As notas de questionários são calculadas
        automaticamente ao concluir o quiz.
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-body correction-item-intro">
        <p className="eyebrow" style={{ margin: '0 0 0.35rem' }}>
          Questionário selecionado
        </p>
        <h2 className="correction-item-title">{props.quizTitle || '—'}</h2>
        {props.quizDescription?.trim() ? (
          <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
            {props.quizDescription}
          </p>
        ) : null}
        <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
          Expanda cada aluno para ver todas as perguntas e respostas da tentativa.
        </p>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Finalizado em</th>
              <th>Nota (0–10)</th>
              <th>Detalhe</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.flatMap((row) => {
              const expanded = expandedIds.has(row.id);
              const rows = [
                <tr key={row.id}>
                  <td>
                    <strong>{row.student.name}</strong>
                    <div className="small muted">{row.student.email}</div>
                  </td>
                  <td className="small muted">{formatDateTime(row.finishedAt)}</td>
                  <td>{row.grade10 != null ? <strong>{row.grade10.toFixed(1)}</strong> : '—'}</td>
                  <td className="small muted">
                    {row.score != null && row.maxScore != null
                      ? `${row.score}/${row.maxScore} pts`
                      : '—'}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className={`correction-expand-btn${expanded ? ' is-open' : ''}`}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Ocultar respostas' : 'Ver respostas'}
                        title={expanded ? 'Ocultar respostas' : 'Ver respostas'}
                        onClick={() => toggleExpand(row.id)}
                      >
                        ▼
                      </button>
                      {row.pendingEssay ? (
                        <span className="badge badge-warn">Dissertativa pendente</span>
                      ) : row.corrected ? (
                        <span className="badge badge-brand">Automática</span>
                      ) : (
                        <span className="badge badge-warn">Pendente</span>
                      )}
                    </div>
                  </td>
                </tr>,
              ];

              if (expanded) {
                rows.push(
                  <tr key={`${row.id}-answers`}>
                    <td colSpan={5}>
                      <QuizAnswersList answers={row.answers} />
                    </td>
                  </tr>,
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
