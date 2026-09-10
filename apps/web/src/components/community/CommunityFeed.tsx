'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth/api';
import {
  CommunityLanguageNotice,
  isCommunityLanguageBlocked,
} from '@/components/community/CommunityLanguageNotice';

export type CommunityCourseOption = {
  id: string;
  title: string;
  slug?: string;
  synopsis?: string | null;
  topicCount?: number;
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
  basePath: string;
  loadCourses: () => Promise<CommunityCourseOption[]>;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function communityHandle(c: CommunityCourseOption) {
  const slug = (c.slug || c.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `c/${slug || 'comunidade'}`;
}

function initial(title: string) {
  return (title.trim()[0] || 'C').toUpperCase();
}

function Directory({
  courses,
  loading,
  basePath,
}: {
  courses: CommunityCourseOption[];
  loading: boolean;
  basePath: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return courses;
    return courses.filter((c) =>
      normalize(`${c.title} ${c.slug ?? ''} ${c.synopsis ?? ''}`).includes(needle),
    );
  }, [courses, query]);

  return (
    <>
      <div className="page-header catalog-toolbar">
        <div>
          <p className="eyebrow">Descobrir</p>
          <h1>Comunidades</h1>
          <p>Escolha uma comunidade de curso para ler e publicar, no estilo de um fórum.</p>
        </div>
        <div className="community-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comunidades"
            aria-label="Buscar comunidades"
          />
        </div>
      </div>

      {loading ? <p className="muted">Carregando comunidades…</p> : null}
      {!loading && filtered.length === 0 ? (
        <div className="empty-state">
          {query.trim()
            ? 'Nenhuma comunidade encontrada com essa busca.'
            : 'Você ainda não tem comunidades. Elas aparecem nos cursos em que você participa.'}
        </div>
      ) : null}

      <ul className="community-dir">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link className="community-dir-card" href={`${basePath}?courseId=${c.id}`}>
              <span className="community-dir-avatar" aria-hidden>
                {initial(c.title)}
              </span>
              <span className="community-dir-body">
                <strong>{c.title}</strong>
                <span className="community-dir-handle">{communityHandle(c)}</span>
                <span className="community-dir-meta muted small">
                  {c.topicCount ?? 0} publicação{(c.topicCount ?? 0) === 1 ? '' : 'ões'}
                </span>
                {c.synopsis ? (
                  <span className="community-dir-excerpt">{c.synopsis}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Diretório de comunidades ou feed de um curso. */
export function CommunityFeed({ basePath, loadCourses }: Props) {
  const search = useSearchParams();
  const courseId = search.get('courseId') ?? '';
  const [courses, setCourses] = useState<CommunityCourseOption[]>([]);
  const [moduleVideoId] = useState(search.get('moduleVideoId') ?? '');
  const [lessonHint] = useState(search.get('lessonTitle') ?? '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [title, setTitle] = useState(lessonHint ? `Dúvida: ${lessonHint}` : '');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [languageBlocked, setLanguageBlocked] = useState(false);

  const reloadTopics = useCallback(
    async (cid: string) => {
      if (!cid) {
        setTopics([]);
        return;
      }
      const qs =
        moduleVideoId && search.get('filterLesson') === '1'
          ? `?moduleVideoId=${encodeURIComponent(moduleVideoId)}`
          : '';
      const list = await apiFetch<Topic[]>(`/courses/${cid}/topics${qs}`);
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar comunidades');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCourses]);

  useEffect(() => {
    if (!courseId) return;
    setTopicsLoading(true);
    void reloadTopics(courseId)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar publicações'))
      .finally(() => setTopicsLoading(false));
  }, [courseId, reloadTopics]);

  const courseTitle = useMemo(
    () => courses.find((c) => c.id === courseId)?.title ?? 'Comunidade',
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
      if (isCommunityLanguageBlocked(err)) {
        setLanguageBlocked(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Falha ao publicar');
    }
  }

  function authorRole(t: Topic): string | undefined {
    const r = t.author.role;
    return typeof r === 'string' ? r : r?.code;
  }

  if (!courseId) {
    return (
      <>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        <Directory courses={courses} loading={loading} basePath={basePath} />
      </>
    );
  }

  return (
    <>
      <CommunityLanguageNotice
        open={languageBlocked}
        onClose={() => setLanguageBlocked(false)}
      />
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="page-header community-feed-header">
        <div>
          <p className="eyebrow">{courseTitle}</p>
          <h1>Comunidade</h1>
          <p>Publicações e discussões do curso — tire dúvidas e converse com a turma.</p>
        </div>
        <Link className="btn btn-secondary btn-sm" href={basePath}>
          Todas as comunidades
        </Link>
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
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          Publicar
        </button>
      </form>

      <div className="community-feed">
        {topicsLoading ? <p className="muted">Carregando…</p> : null}
        {!topicsLoading && topics.length === 0 ? (
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
