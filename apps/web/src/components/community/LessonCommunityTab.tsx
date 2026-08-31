'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth/api';

type Topic = {
  id: string;
  title: string;
  author: { name: string };
  _count?: { replies: number };
  moduleVideo?: { id: string; title: string } | null;
};

type Props = {
  courseId: string;
  moduleVideoId: string;
  lessonTitle: string;
  /** Base da comunidade: /aluno/comunidade ou /professor/comunidade */
  communityBasePath: string;
};

/** Aba Comunidade na aula: posts recentes + CTAs. */
export function LessonCommunityTab({
  courseId,
  moduleVideoId,
  lessonTitle,
  communityBasePath,
}: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyLesson, setOnlyLesson] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = onlyLesson ? `?moduleVideoId=${encodeURIComponent(moduleVideoId)}` : '';
      const list = await apiFetch<Topic[]>(`/courses/${courseId}/topics${qs}`);
      setTopics(list.slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [courseId, moduleVideoId, onlyLesson]);

  useEffect(() => {
    void load();
  }, [load]);

  const newPostHref = `${communityBasePath}?courseId=${encodeURIComponent(courseId)}&moduleVideoId=${encodeURIComponent(moduleVideoId)}&lessonTitle=${encodeURIComponent(lessonTitle)}`;
  const openAllHref = `${communityBasePath}?courseId=${encodeURIComponent(courseId)}`;

  return (
    <div className="lesson-community">
      <div className="lesson-community-actions">
        <Link className="btn btn-primary btn-sm" href={newPostHref}>
          Nova dúvida desta aula
        </Link>
        <Link className="btn btn-secondary btn-sm" href={openAllHref}>
          Abrir comunidade do curso
        </Link>
      </div>

      <label className="lesson-community-filter small">
        <input
          type="checkbox"
          checked={onlyLesson}
          onChange={(e) => setOnlyLesson(e.target.checked)}
        />
        Só publicações desta aula
      </label>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {loading ? <p className="muted">Carregando…</p> : null}
      {!loading && topics.length === 0 ? (
        <div className="empty-state">
          Nenhuma discussão
          {onlyLesson ? ' sobre esta aula' : ''} ainda. Publique a primeira dúvida.
        </div>
      ) : null}
      <ul className="community-post-list lesson-community-list">
        {topics.map((t) => (
          <li key={t.id} className="community-post-item">
            <Link href={`${communityBasePath}/${t.id}`}>
              <strong>{t.title}</strong>
            </Link>
            <div className="community-post-meta muted small">
              <span>{t.author.name}</span>
              <span>
                {t._count?.replies ?? 0} comentário
                {(t._count?.replies ?? 0) === 1 ? '' : 's'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
