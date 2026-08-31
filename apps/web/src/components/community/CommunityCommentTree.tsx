'use client';

import { FormEvent, useState } from 'react';

export type CommentNode = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: { id: string; name: string; role: string };
  children: CommentNode[];
};

type Props = {
  nodes: CommentNode[];
  depth?: number;
  maxDepth?: number;
  onReply: (parentId: string, body: string) => Promise<void>;
  /** Excluir comentário (autor ou moderador). */
  onDelete?: (replyId: string) => Promise<void>;
  /** Usuário atual pode moderar (professor/admin do curso). */
  canModerate?: boolean;
  currentUserId?: string | null;
};

/** Árvore de comentários com “Responder” e exclusão (moderação). */
export function CommunityCommentTree({
  nodes,
  depth = 0,
  maxDepth = 4,
  onReply,
  onDelete,
  canModerate = false,
  currentUserId = null,
}: Props) {
  return (
    <ul className={`community-thread${depth > 0 ? ' is-nested' : ''}`}>
      {nodes.map((n) => (
        <CommentItem
          key={n.id}
          node={n}
          depth={depth}
          maxDepth={maxDepth}
          onReply={onReply}
          onDelete={onDelete}
          canModerate={canModerate}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}

function CommentItem({
  node,
  depth,
  maxDepth,
  onReply,
  onDelete,
  canModerate,
  currentUserId,
}: {
  node: CommentNode;
  depth: number;
  maxDepth: number;
  onReply: (parentId: string, body: string) => Promise<void>;
  onDelete?: (replyId: string) => Promise<void>;
  canModerate: boolean;
  currentUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canReply = depth < maxDepth;
  const canDelete =
    Boolean(onDelete) &&
    (canModerate || (currentUserId != null && currentUserId === node.author.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onReply(node.id, body.trim());
      setBody('');
      setOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Falha ao responder');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    const ok = window.confirm('Excluir este comentário e as respostas abaixo dele?');
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onDelete(node.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Falha ao excluir');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="community-comment">
      <div className="community-comment-meta">
        <strong>{node.author.name}</strong>
        {node.author.role === 'PROFESSOR' ? (
          <span className="community-role-badge">professor</span>
        ) : null}
        <time dateTime={node.createdAt}>{formatWhen(node.createdAt)}</time>
      </div>
      <p className="community-comment-body">{node.body}</p>
      <div className="community-comment-actions">
        {canReply ? (
          <button
            type="button"
            className="btn-ghost btn-sm community-reply-toggle"
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
          >
            {open ? 'Cancelar' : 'Responder'}
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="btn-ghost btn-sm community-delete-btn"
            onClick={() => void handleDelete()}
            disabled={busy}
            title="Excluir comentário"
          >
            Excluir
          </button>
        ) : null}
      </div>
      {open ? (
        <form className="community-reply-form" onSubmit={(e) => void submit(e)}>
          {err ? <div className="alert alert-danger">{err}</div> : null}
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua resposta…"
            required
            disabled={busy}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
            Enviar
          </button>
        </form>
      ) : null}
      {err && !open ? <div className="alert alert-danger">{err}</div> : null}
      {node.children?.length ? (
        <CommunityCommentTree
          nodes={node.children}
          depth={depth + 1}
          maxDepth={maxDepth}
          onReply={onReply}
          onDelete={onDelete}
          canModerate={canModerate}
          currentUserId={currentUserId}
        />
      ) : null}
    </li>
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
