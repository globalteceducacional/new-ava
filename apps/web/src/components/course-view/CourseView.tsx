'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/auth/api';
import type { Category, Course } from '@/lib/admin/types';
import { COURSE_STATUS_LABELS } from '@/lib/admin/types';
import { deleteModule, updateModule } from '@/lib/course-editor/lesson-api';
import type { ActivityRow, ModuleRow, QuizQuestionDraft, QuizRow } from '@/lib/course-editor/types';
import { getContinueLessonId, hasCourseProgress } from '@/lib/course-view/lesson-progress';
import { mediaStatusLabel } from '@/lib/course-view/media-status';
import { errorMessage } from '@/lib/format';
import {
  QuizQuestionsEditor,
  emptyQuizQuestion,
  serializeQuizQuestions,
} from '@/components/course-editor/QuizQuestionsEditor';

type Props = {
  courseId: string;
  /** Mostra ações de edição do conteúdo existente. */
  editable?: boolean;
  /** Rota do editor completo (wizard), quando disponível. */
  fullEditorHref?: string;
  backHref: string;
  backLabel: string;
  /** Rota da aula (aluno ou admin). */
  lessonHref: (videoId: string) => string;
  activityHref?: (activityId: string) => string;
  quizHref?: (quizId: string) => string;
};

type EditingKind = 'course' | 'module' | 'activity' | 'quiz';

/** Extrai rótulo "Módulo N" e o nome limpo a partir do título do seed. */
function moduleHeading(title: string, index: number) {
  const match = title.match(/^Módulo\s+(\d+)\s*[—\-–]\s*(.+)$/i);
  if (match) {
    return { label: `Módulo ${match[1]}`, name: match[2].trim() };
  }
  return { label: `Módulo ${index + 1}`, name: title };
}

export function CourseView({
  courseId,
  editable = false,
  fullEditorHref,
  backHref,
  backLabel,
  lessonHref,
  activityHref,
  quizHref,
}: Props) {
  const [course, setCourse] = useState<Course | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  /** Próxima aula por módulo (lido do progresso local após montar). */
  const [continueByModule, setContinueByModule] = useState<Record<string, string>>({});
  const [courseStarted, setCourseStarted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [formDue, setFormDue] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([emptyQuizQuestion()]);
  const [quizLoading, setQuizLoading] = useState(false);

  const load = useCallback(async () => {
    const [c, mods, acts, qs] = await Promise.all([
      apiFetch<Course>(`/courses/${courseId}`),
      apiFetch<ModuleRow[]>(`/courses/${courseId}/modules`),
      apiFetch<ActivityRow[]>(`/courses/${courseId}/activities`),
      apiFetch<QuizRow[]>(`/courses/${courseId}/quizzes`),
    ]);
    setCourse(c);
    setModules(mods);
    setActivities(acts);
    setQuizzes(qs);
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    void (async () => {
      setLoading(true);
      try {
        await load();
        if (editable) setCategories(await apiFetch<Category[]>('/categories'));
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar o curso'));
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, editable, load]);

  // Recalcula a aula de "continuar" no cliente (e ao voltar da playlist).
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const mod of modules) {
      const id = getContinueLessonId(
        mod.id,
        mod.videos.map((v) => v.id),
      );
      if (id) map[mod.id] = id;
    }
    setContinueByModule(map);
    setCourseStarted(hasCourseProgress(modules.map((m) => m.id)));
  }, [modules]);

  useEffect(() => {
    function refreshProgress() {
      const map: Record<string, string> = {};
      for (const mod of modules) {
        const id = getContinueLessonId(
          mod.id,
          mod.videos.map((v) => v.id),
        );
        if (id) map[mod.id] = id;
      }
      setContinueByModule(map);
      setCourseStarted(hasCourseProgress(modules.map((m) => m.id)));
    }
    window.addEventListener('focus', refreshProgress);
    return () => window.removeEventListener('focus', refreshProgress);
  }, [modules]);

  async function perform(action: () => Promise<void>, ok: string, fail: string) {
    setBusy(true);
    try {
      await action();
      setNotice(ok);
      setError(null);
      await load();
      return true;
    } catch (e) {
      setError(errorMessage(e, fail));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    setEditing(null);
    setEditingId(null);
    setQuizQuestions([emptyQuizQuestion()]);
    setQuizLoading(false);
  }

  function openCourseEdit() {
    if (!course) return;
    setFormTitle(course.title);
    setFormBody(course.synopsis ?? '');
    setFormCategories(course.categories.map((c) => c.category.id));
    setEditingId(course.id);
    setEditing('course');
  }

  function openModuleEdit(mod: ModuleRow) {
    setFormTitle(mod.title);
    setFormBody(mod.description ?? '');
    setEditingId(mod.id);
    setEditing('module');
  }

  function openActivityEdit(activity: ActivityRow) {
    setFormTitle(activity.title);
    setFormBody(activity.description ?? '');
    setFormDue(activity.dueDate ? activity.dueDate.slice(0, 10) : '');
    setEditingId(activity.id);
    setEditing('activity');
  }

  async function openQuizEdit(quiz: QuizRow) {
    setFormTitle(quiz.title);
    setFormBody(quiz.description ?? '');
    setEditingId(quiz.id);
    setEditing('quiz');
    setQuizQuestions([emptyQuizQuestion()]);
    setQuizLoading(true);
    try {
      const detail = await apiFetch<{
        title: string;
        description: string | null;
        questions: Array<{
          id: string;
          type: QuizQuestionDraft['type'];
          text: string;
          points: number;
          options: Array<{
            id: string;
            text: string;
            isCorrect?: boolean;
          }>;
        }>;
      }>(`/quizzes/${quiz.id}`);
      setFormTitle(detail.title);
      setFormBody(detail.description ?? '');
      const loaded = (detail.questions ?? []).map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        points: q.points ?? 1,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: Boolean(o.isCorrect),
        })),
      }));
      setQuizQuestions(loaded.length ? loaded : [emptyQuizQuestion()]);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar perguntas do quiz'));
      closeModal();
    } finally {
      setQuizLoading(false);
    }
  }

  async function submitModal(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editingId) return;

    const actions: Record<EditingKind, () => Promise<void>> = {
      course: async () => {
        await apiFetch(`/courses/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: formTitle,
            synopsis: formBody || undefined,
            categoryIds: formCategories,
          }),
        });
      },
      module: async () => {
        await updateModule(courseId, editingId, {
          title: formTitle,
          description: formBody || null,
        });
      },
      activity: async () => {
        await apiFetch(`/activities/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: formTitle,
            description: formBody || null,
            dueDate: formDue ? new Date(formDue).toISOString() : null,
          }),
        });
      },
      quiz: async () => {
        await apiFetch(`/quizzes/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: formTitle,
            description: formBody || null,
            questions: serializeQuizQuestions(quizQuestions),
          }),
        });
      },
    };

    const ok = await perform(actions[editing], 'Alteração salva.', 'Falha ao salvar');
    if (ok) closeModal();
  }

  async function removeModule(mod: ModuleRow) {
    if (!window.confirm(`Excluir o módulo "${mod.title}" e suas aulas?`)) return;
    await perform(
      () => deleteModule(courseId, mod.id).then(() => undefined),
      'Módulo excluído.',
      'Falha ao excluir módulo',
    );
  }

  async function removeActivity(activity: ActivityRow) {
    if (!window.confirm(`Excluir a atividade "${activity.title}"?`)) return;
    await perform(
      async () => {
        await apiFetch(`/activities/${activity.id}`, { method: 'DELETE' });
      },
      'Atividade excluída.',
      'Falha ao excluir atividade',
    );
  }

  async function removeQuiz(quiz: QuizRow) {
    if (!window.confirm(`Excluir o questionário "${quiz.title}"?`)) return;
    await perform(
      async () => {
        await apiFetch(`/quizzes/${quiz.id}`, { method: 'DELETE' });
      },
      'Questionário excluído.',
      'Falha ao excluir questionário',
    );
  }

  const continueLesson =
    modules
      .map(
        (mod) => mod.videos.find((v) => v.id === continueByModule[mod.id]) ?? mod.videos[0] ?? null,
      )
      .find((v) => v !== null) ?? null;
  const continueCtaLabel = editable
    ? 'Ver como aluno'
    : courseStarted
      ? 'Continuar assistindo'
      : 'Iniciar curso';
  const modalTitles: Record<EditingKind, string> = {
    course: 'Editar dados do curso',
    module: 'Editar módulo',
    activity: 'Editar atividade',
    quiz: 'Editar questionário',
  };

  return (
    <AppShell title={course?.title ?? 'Curso'}>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            <Link href={backHref}>{backLabel}</Link>
            {course ? ` · ${COURSE_STATUS_LABELS[course.status]}` : ''}
          </p>
          <div className="view-edit-bar">
            <h1 style={{ margin: 0 }}>{course?.title ?? 'Carregando…'}</h1>
            {editable && course ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={openCourseEdit}
              >
                Editar dados
              </button>
            ) : null}
          </div>
          {course?.categories.length ? (
            <div className="row" style={{ marginTop: '0.5rem' }}>
              {course.categories.map((c) => (
                <span key={c.category.id} className="badge badge-brand">
                  {c.category.name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="course-synopsis">
            {course?.synopsis ??
              'Abra um módulo e dê play em uma aula para ver a playlist, a descrição e os materiais complementares.'}
          </p>
        </div>
        {editable && fullEditorHref ? (
          <Link className="btn btn-secondary" href={fullEditorHref}>
            Edição completa
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      ) : null}
      {loading ? (
        <div className="panel">
          <div className="empty-state">Carregando…</div>
        </div>
      ) : null}

      {!loading ? (
        <div className="curriculum" style={{ marginBottom: '1.5rem' }}>
          {modules.map((mod, modIndex) => {
            const heading = moduleHeading(mod.title, modIndex);
            const isFirst = modIndex === 0;
            const modActivities = activities.filter(
              (a) => a.moduleId === mod.id || (!a.moduleId && isFirst),
            );
            const modQuizzes = quizzes.filter(
              (q) => q.moduleId === mod.id || (!q.moduleId && isFirst),
            );
            const continueId = continueByModule[mod.id] ?? mod.videos[0]?.id;
            const showCourseCta = Boolean(isFirst && continueLesson);
            return (
              <section key={mod.id} className="curriculum-section">
                <div className="curriculum-head curriculum-head-row">
                  <div className="curriculum-head-main">
                    <p className="curriculum-label">{heading.label}</p>
                    <div className="curriculum-title-row">
                      <h2 className="curriculum-title">{heading.name}</h2>
                      <div className="curriculum-meta">
                        <span className="badge">
                          {mod.videos.length} aula
                          {mod.videos.length === 1 ? '' : 's'}
                        </span>
                        {modActivities.length ? (
                          <span className="badge">
                            {modActivities.length} atividade
                            {modActivities.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                        {modQuizzes.length ? (
                          <span className="badge">
                            {modQuizzes.length} quiz
                            {modQuizzes.length === 1 ? '' : 'zes'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {mod.description ? <p className="curriculum-desc">{mod.description}</p> : null}
                  </div>
                  <div className="curriculum-head-actions">
                    {editable ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => openModuleEdit(mod)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => void removeModule(mod)}
                        >
                          Excluir
                        </button>
                      </>
                    ) : null}
                    {showCourseCta && continueLesson ? (
                      <Link className="btn btn-primary" href={lessonHref(continueLesson.id)}>
                        {continueCtaLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <ul className="curriculum-cards">
                  {mod.videos.map((video, videoIndex) => {
                    const isContinue = video.id === continueId;
                    return (
                      <li key={video.id}>
                        <Link
                          href={lessonHref(video.id)}
                          className="curriculum-card"
                          aria-label={`Abrir aula: ${video.title}`}
                        >
                          <span className="curriculum-card-icon curriculum-idx" aria-hidden="true">
                            {videoIndex + 1}
                          </span>
                          <span className="curriculum-card-body">
                            <span className="curriculum-card-top">
                              <strong>{video.title}</strong>
                              {isContinue && mod.videos.length > 1 ? (
                                <span className="badge">continuar</span>
                              ) : null}
                              {editable && video.mediaAsset ? (
                                <span className="badge">
                                  {mediaStatusLabel(
                                    video.mediaAsset.status,
                                    video.mediaAsset.progressPercent,
                                  )}
                                </span>
                              ) : null}
                            </span>
                            {video.description ? (
                              <p className="curriculum-card-desc">{video.description}</p>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}

                  {modActivities.map((activity) => (
                    <li key={activity.id}>
                      <article className="curriculum-card curriculum-card-plain">
                        <div className="curriculum-card-body">
                          <div className="curriculum-card-top">
                            {activityHref ? (
                              <Link href={activityHref(activity.id)}>
                                <strong>{activity.title}</strong>
                              </Link>
                            ) : (
                              <strong>{activity.title}</strong>
                            )}
                          </div>
                        </div>
                        {editable ? (
                          <span className="curriculum-card-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => openActivityEdit(activity)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => void removeActivity(activity)}
                            >
                              Excluir
                            </button>
                          </span>
                        ) : null}
                      </article>
                    </li>
                  ))}

                  {modQuizzes.map((quiz) => (
                    <li key={quiz.id}>
                      <article className="curriculum-card curriculum-card-plain">
                        <div className="curriculum-card-body">
                          <div className="curriculum-card-top">
                            {quizHref ? (
                              <Link href={quizHref(quiz.id)}>
                                <strong>{quiz.title}</strong>
                              </Link>
                            ) : (
                              <strong>{quiz.title}</strong>
                            )}
                          </div>
                        </div>
                        {editable ? (
                          <span className="curriculum-card-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => openQuizEdit(quiz)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => void removeQuiz(quiz)}
                            >
                              Excluir
                            </button>
                          </span>
                        ) : null}
                      </article>
                    </li>
                  ))}

                  {!mod.videos.length && !modActivities.length && !modQuizzes.length ? (
                    <li>
                      <div className="curriculum-card">
                        <span className="curriculum-card-body">
                          <p className="curriculum-card-desc" style={{ margin: 0 }}>
                            Nenhum conteúdo neste módulo ainda.
                          </p>
                        </span>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}

          {!modules.length && !activities.length && !quizzes.length ? (
            <div className="panel">
              <div className="empty-state">
                {editable
                  ? 'Nada publicado ainda — use “Edição completa” para montar o curso.'
                  : 'Nenhum conteúdo publicado ainda.'}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={editing !== null}
        title={editing ? modalTitles[editing] : ''}
        onClose={closeModal}
        wide={editing === 'quiz'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Cancelar
            </button>
            <button
              type="submit"
              form="course-view-form"
              className="btn btn-primary"
              disabled={busy || quizLoading}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="course-view-form" onSubmit={submitModal}>
          <div className="field">
            <label htmlFor="cv-title">Título</label>
            <input
              id="cv-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="cv-body">
              {editing === 'course' ? 'Descrição do curso' : 'Descrição'}
            </label>
            <textarea
              id="cv-body"
              rows={editing === 'course' ? 5 : 3}
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
            />
          </div>

          {editing === 'activity' ? (
            <div className="field">
              <label htmlFor="cv-due">Prazo</label>
              <input
                id="cv-due"
                type="date"
                value={formDue}
                onChange={(e) => setFormDue(e.target.value)}
              />
            </div>
          ) : null}

          {editing === 'course' ? (
            <div className="field">
              <label>Categorias</label>
              <CategoryMultiSelect
                options={categories}
                value={formCategories}
                onChange={setFormCategories}
                onCreated={(created) => setCategories((prev) => [...prev, created])}
                disabled={busy}
              />
            </div>
          ) : null}

          {editing === 'quiz' ? (
            quizLoading ? (
              <p className="muted small">Carregando perguntas…</p>
            ) : (
              <QuizQuestionsEditor
                questions={quizQuestions}
                onChange={setQuizQuestions}
                disabled={busy}
              />
            )
          ) : null}
        </form>
      </Modal>
    </AppShell>
  );
}
