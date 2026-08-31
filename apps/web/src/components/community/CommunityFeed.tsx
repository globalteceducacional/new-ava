'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth/api';

export type CommunityCourseOption = {
  id: string;
  title: string;
};

type Topic = {
  id: string;
  title: string;
  body: string;
  createdAt?: string;
  author: { name: string; role?: { code: string } | string };
  _count?: { replies: number };
  moduleVideo?: { id: string; title: string } | null;
};

type Props = {
  /** Prefixo de rota: /aluno/comunidade ou /professor/comunidade */
  basePath: string;
  /** Carrega opções de curso para o seletor. */
  loadCourses: () => Promise<CommunityCourseOption[]>;
};

/** Feed de publicações de um curso (comunidade). */
export function CommunityFeed({ basePath, loadCourses }: Props) {
  const search = useSearchParams();
  const [courses, setCourses] = useState<CommunityCourseOption[]>([]);
  const [courseId, setCourseId] = useState(search.get('courseId') ?? '');
  const [moduleVideoId] = useState(search.get('moduleVideoId') ?? '');
  const [lessonHint] = useState(search.get('lessonTitle') ?? '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [title, setTitle] = useState(lessonHint ? `Dúvida: ${lessonHint}` : '');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadTopics = useCallback(
    async (cid: string) => {
      if (!cid) {
        setTopics([]);
        return;
      }
      const qs = moduleVideoId ? `?moduleVideoId=${encodeURIComponent(moduleVideoId)}` : '';
      // Na listagem geral mostramos todos; se veio da aula, prioriza filtro mas
      // também permite ver o feed completo trocando o select.
      const list = await apiFetch<Topic[]>(
        `/courses/${cid}/topics${moduleVideoId && search.get('filterLesson') === '1' ? qs : ''}`,
      );
      setTopics(list);
    },
    [moduleVideoId, search],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const opts = await loadCourses();
        setCourses(opts);
        setCourseId((prev) => prev || opts[0]?.id || '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar cursos');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCourses]);

  useEffect(() => {
    if (!courseId) return;
    void reloadTopics(courseId).catch((e) =>
      setError(e instanceof Error ? e.message : 'Erro ao carregar publicações'),
    );
  }, [courseId, reloadTopics]);

  const courseTitle = useMemo(
    () => courses.find((c) => c.id === courseId)?.title ?? 'Curso',
    [courses, courseId],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    try {
      setError(null);
      await apiFetch(`/courses/${courseId}/topics`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          ...(moduleVideoId ? { moduleVideoId } : {}),
        }),
      });
      setTitle('');
      setBody('');
      await reloadTopics(courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao publicar');
    }
  }

  function authorRole(t: Topic): string | undefined {
    const r = t.author.role;
    return typeof r === 'string' ? r : r?.code;
  }

  return (
    <>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="page-header community-feed-header">
        <div>
          <p className="eyebrow">{courseTitle}</p>
          <h1>Comunidade</h1>
          <p>Publicações e discussões do curso — tire dúvidas e converse com a turma.</p>
        </div>
        <select
          className="community-course-select"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={loading || courses.length === 0}
          aria-label="Selecionar curso"
        >
          {courses.length === 0 ? (
            <option value="">Nenhum curso</option>
          ) : (
            courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))
          )}
        </select>
      </div>

      {moduleVideoId ? (
        <p className="community-lesson-hint muted small">
          Nova publicação será vinculada a esta aula
          {lessonHint ? `: ${lessonHint}` : ''}.
        </p>
      ) : null}

      <form onSubmit={onCreate} className="community-compose">
        <div className="field">
          <label htmlFor="community-title">Nova publicação</label>
          <input
            id="community-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (ex.: Dúvida sobre a aula 3)"
            required
            minLength={3}
            disabled={!courseId}
          />
        </div>
        <div className="field">
          <label htmlFor="community-body">Mensagem</label>
          <textarea
            id="community-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua dúvida ou comentário…"
            required
            disabled={!courseId}
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={!courseId}>
          Publicar
        </button>
      </form>

      <div className="community-feed">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && topics.length === 0 ? (
          <div className="empty-state">
            Nenhuma publicação ainda. Seja o primeiro a começar a conversa.
          </div>
        ) : null}
        <ul className="community-post-list">
          {topics.map((t) => (
            <li key={t.id} className="community-post-item">
              <Link className="community-post-item-link" href={`${basePath}/${t.id}`}>
                <strong className="community-post-item-title">{t.title}</strong>
                <p className="community-post-excerpt">{excerpt(t.body)}</p>
                <div className="community-post-meta muted small">
                  <span>{t.author.name}</span>
                  {authorRole(t) === 'PROFESSOR' ? (
                    <span className="community-role-badge">professor</span>
                  ) : null}
                  {t.moduleVideo ? <span>aula: {t.moduleVideo.title}</span> : null}
                  <span>
                    {t._count?.replies ?? 0} comentário
                    {(t._count?.replies ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function excerpt(text: string, max = 160): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
