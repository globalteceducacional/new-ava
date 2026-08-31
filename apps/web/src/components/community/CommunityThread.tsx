'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@ava/shared';
import { apiFetch } from '@/lib/auth/api';
import { getStoredUser } from '@/lib/auth/session';
import {
  CommunityCommentTree,
  type CommentNode,
} from '@/components/community/CommunityCommentTree';

type TopicDetail = {
  id: string;
  courseId: string;
  title: string;
  body: string;
  createdAt: string;
  author: { id?: string; name: string; role: string };
  course?: { id: string; title: string };
  moduleVideo?: { title: string } | null;
  replies: CommentNode[];
};

type Props = {
  topicId: string;
  basePath: string;
};

function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countComments(n.children ?? []), 0);
}

/** Página de um post com comentários aninhados. */
export function CommunityThread({ topicId, basePath }: Props) {
  const router = useRouter();
  const user = useMemo(() => getStoredUser(), []);
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canModerate = Boolean(
    user &&
    (user.role === Role.ADM_MASTER ||
      user.role === Role.ADM_INSTITUICAO ||
      user.role === Role.PROFESSOR),
  );

  const load = useCallback(async () => {
    const data = await apiFetch<TopicDetail>(`/topics/${topicId}`);
    setTopic(data);
  }, [topicId]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Erro'));
  }, [load]);

  async function sendReply(parentId: string | null, body: string) {
    await apiFetch(`/topics/${topicId}/replies`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        ...(parentId ? { parentId } : {}),
      }),
    });
    await load();
  }

  async function deleteReply(replyId: string) {
    await apiFetch(`/replies/${replyId}`, { method: 'DELETE' });
    await load();
  }

  async function deleteTopic() {
    const ok = window.confirm('Excluir esta publicação e todos os comentários?');
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/topics/${topicId}`, { method: 'DELETE' });
      router.push(topic?.courseId ? `${basePath}?courseId=${topic.courseId}` : basePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir publicação');
    } finally {
      setBusy(false);
    }
  }

  async function onRootReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendReply(null, reply.trim());
      setReply('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao comentar');
    } finally {
      setBusy(false);
    }
  }

  const canDeleteTopic =
    canModerate || (user != null && topic?.author.id != null && user.id === topic.author.id);

  const commentCount = topic ? countComments(topic.replies) : 0;

  return (
    <div className="community-thread-page">
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {topic ? (
        <>
          <nav className="community-thread-nav">
            <Link className="community-back-link" href={`${basePath}?courseId=${topic.courseId}`}>
              ← Voltar à comunidade
            </Link>
            {topic.moduleVideo ? (
              <span className="community-thread-lesson muted small">
                Aula: {topic.moduleVideo.title}
              </span>
            ) : null}
          </nav>

          <article className="community-post-card">
            <p className="eyebrow community-post-course">
              <Link href={`${basePath}?courseId=${topic.courseId}`}>
                {topic.course?.title ?? 'Comunidade'}
              </Link>
            </p>
            <h1 className="community-post-title">{topic.title}</h1>
            <div className="community-post-meta muted small">
              <span className="community-author">{topic.author.name}</span>
              {topic.author.role === 'PROFESSOR' ? (
                <span className="community-role-badge">professor</span>
              ) : null}
              <span className="community-meta-sep" aria-hidden>
                ·
              </span>
              <time dateTime={topic.createdAt}>{formatWhen(topic.createdAt)}</time>
            </div>
            <div className="community-post-body">{topic.body}</div>
            {canDeleteTopic ? (
              <div className="community-post-toolbar">
                <button
                  type="button"
                  className="btn-ghost btn-sm community-delete-btn"
                  onClick={() => void deleteTopic()}
                  disabled={busy}
                >
                  Excluir publicação
                </button>
              </div>
            ) : null}
          </article>

          <section className="community-comments-panel">
            <header className="community-comments-head">
              <h2 className="community-comments-title">
                Comentários
                <span className="community-comments-count">{commentCount}</span>
              </h2>
            </header>

            {topic.replies.length === 0 ? (
              <p className="community-comments-empty muted">
                Nenhum comentário ainda. Seja o primeiro a responder.
              </p>
            ) : (
              <CommunityCommentTree
                nodes={topic.replies}
                canModerate={canModerate}
                currentUserId={user?.id ?? null}
                onReply={async (parentId, body) => {
                  await sendReply(parentId, body);
                }}
                onDelete={deleteReply}
              />
            )}

            <form
              onSubmit={(e) => void onRootReply(e)}
              className="community-compose community-compose-inline"
            >
              <div className="field">
                <label htmlFor="root-reply">Adicionar um comentário</label>
                <textarea
                  id="root-reply"
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escreva sua resposta…"
                  required
                  disabled={busy}
                />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                Enviar comentário
              </button>
            </form>
          </section>
        </>
      ) : (
        <p className="muted">Carregando…</p>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
