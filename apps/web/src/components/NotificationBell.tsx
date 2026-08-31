'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth/api';
import type { AppNotification } from '@/components/NotificationsPanel';

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
  /** Só alunos/professores com alocação escolar recebem notificações. */
  enabled: boolean;
};

/** Sino na topbar: badge de não lidas + painel ao clicar. */
export function NotificationBell({ enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    try {
      const data = await apiFetch<{ count: number }>('/notifications/unread-count');
      setUnread(data.count);
    } catch {
      /* silencioso no badge */
    }
  }, [enabled]);

  const loadList = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AppNotification[]>('/notifications?limit=30');
      setItems(data);
      setUnread(data.filter((n) => !n.readAt).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refreshUnread();
    const id = window.setInterval(() => void refreshUnread(), 60_000);
    return () => window.clearInterval(id);
  }, [refreshUnread]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return null;

  async function markAllRead() {
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
      setItems((prev) =>
        prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
      );
      setUnread(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar como lidas');
    }
  }

  async function removeOne(id: string) {
    try {
      await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
      setItems((prev) => {
        const removed = prev.find((n) => n.id === id);
        const next = prev.filter((n) => n.id !== id);
        if (removed && !removed.readAt) {
          setUnread((c) => Math.max(0, c - 1));
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover');
    }
  }

  async function removeAll() {
    try {
      await apiFetch('/notifications/all', { method: 'DELETE' });
      setItems([]);
      setUnread(0);
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
        setUnread((c) => Math.max(0, c - 1));
      } catch {
        /* segue mesmo se falhar */
      }
    }
    setOpen(false);
  }

  const badge = unread > 99 ? '99+' : unread > 0 ? String(unread) : null;

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className={`notif-bell-btn${open ? ' is-open' : ''}`}
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : 'Notificações'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {badge ? <span className="notif-bell-badge">{badge}</span> : null}
      </button>

      {open ? (
        <div className="notif-dropdown" role="dialog" aria-label="Notificações">
          <div className="notif-dropdown-head">
            <strong>Notificações</strong>
            <div className="notif-dropdown-actions">
              {unread > 0 ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void markAllRead()}
                >
                  Marcar lidas
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm notif-remove-all"
                  onClick={() => void removeAll()}
                >
                  Remover todas
                </button>
              ) : null}
            </div>
          </div>

          {error ? <div className="alert alert-danger">{error}</div> : null}
          {loading ? <p className="muted notif-dropdown-empty">Carregando…</p> : null}

          {!loading && items.length === 0 ? (
            <p className="muted notif-dropdown-empty">Nenhuma notificação por enquanto.</p>
          ) : null}

          {!loading && items.length > 0 ? (
            <ul className="notif-dropdown-list">
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
                  <li
                    key={n.id}
                    className={`notif-item notif-item-row${unreadItem ? ' is-unread' : ''}`}
                  >
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void removeOne(n.id);
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm7-5.5V11a7 7 0 1 0-14 0v5.5L3 18v1h18v-1l-2-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
