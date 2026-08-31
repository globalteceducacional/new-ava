'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth/api';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  courseId: string | null;
  readAt: string | null;
  createdAt: string;
};

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

type Props = {
  /** Se false, mostra aviso de que notificações exigem alocação. */
  enabled: boolean;
};

export function NotificationsPanel({ enabled }: Props) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AppNotification[]>('/notifications');
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
      setItems((prev) =>
        prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar como lidas');
    }
  }

  async function removeOne(id: string) {
    try {
      await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover');
    }
  }

  async function removeAll() {
    try {
      await apiFetch('/notifications/all', { method: 'DELETE' });
      setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover todas');
    }
  }

  async function openNotification(n: AppNotification) {
    if (!n.readAt) {
      try {
        await apiFetch(`/notifications/${n.id}/read`, { method: 'PATCH' });
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
        );
      } catch {
        /* segue o link mesmo se falhar */
      }
    }
  }

  if (!enabled) {
    return (
      <div className="empty-state">
        Notificações estão disponíveis apenas para quem tem alocação em uma instituição.
      </div>
    );
  }

  const unread = items.some((n) => !n.readAt);

  return (
    <div className="notif-panel">
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="page-header">
        <div>
          <h1>Notificações</h1>
          <p className="muted">Alterações nos cursos em que você está inserido.</p>
        </div>
        <div className="notif-dropdown-actions">
          {unread ? (
            <button type="button" className="btn-ghost" onClick={() => void markAllRead()}>
              Marcar todas como lidas
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              className="btn-ghost notif-remove-all"
              onClick={() => void removeAll()}
            >
              Remover todas
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="empty-state">Nenhuma notificação por enquanto.</div>
      ) : null}

      <ul className="notif-list">
        {items.map((n) => {
          const unreadItem = !n.readAt;
          const inner = (
            <>
              <div className="notif-item-head">
                <strong>{n.title}</strong>
                <time dateTime={n.createdAt}>{formatWhen(n.createdAt)}</time>
              </div>
              <p>{n.body}</p>
            </>
          );
          return (
            <li key={n.id} className={`notif-item notif-item-row${unreadItem ? ' is-unread' : ''}`}>
              <div className="notif-item-body">
                {n.link ? (
                  <Link href={n.link} onClick={() => void openNotification(n)}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="notif-item-plain"
                    onClick={() => void openNotification(n)}
                  >
                    {inner}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="notif-item-remove"
                aria-label="Remover notificação"
                title="Remover"
                onClick={() => void removeOne(n.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
