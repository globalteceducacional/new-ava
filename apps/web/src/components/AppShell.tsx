'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { initials, navForRole } from '@/lib/auth/nav';
import { apiFetch } from '@/lib/auth/api';
import {
  clearSession,
  getStoredUser,
  logoutRequest,
  persistSession,
  avatarUrlFor,
  type AuthUser,
} from '@/lib/auth/session';
import { Role } from '@ava/shared';

const SIDEBAR_STORAGE_KEY = 'ava_sidebar_closed';

type AppShellProps = {
  title: string;
  /** Se informado, o título da topbar vira link (ex.: voltar ao curso). */
  titleHref?: string;
  children: React.ReactNode;
};

export function AppShell({ title, titleHref, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sidebarClosed, setSidebarClosed] = useState(false);

  useEffect(() => {
    try {
      setSidebarClosed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  function setSidebarOpen(open: boolean) {
    setSidebarClosed(!open);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? '0' : '1');
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      clearSession();
      router.replace('/login');
      return;
    }
    setUser(stored);

    // Sessões antigas sem hasSchool: consulta a API uma vez.
    if (
      (stored.role === Role.ALUNO || stored.role === Role.PROFESSOR) &&
      stored.hasSchool === undefined
    ) {
      void apiFetch<{ hasSchool: boolean }>('/courses/me/has-school')
        .then(({ hasSchool }) => {
          const next = { ...stored, hasSchool };
          persistSession(null, next);
          setUser(next);
        })
        .catch(() => undefined);
    }
  }, [router, pathname]);

  useEffect(() => {
    function onSessionUpdated() {
      const stored = getStoredUser();
      if (stored) setUser(stored);
    }
    window.addEventListener('ava-session-updated', onSessionUpdated);
    return () => window.removeEventListener('ava-session-updated', onSessionUpdated);
  }, []);

  async function onLogout() {
    await logoutRequest();
    router.replace('/login');
  }

  if (!user) {
    return (
      <div className="auth-panel" style={{ minHeight: '100vh' }}>
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  const nav = navForRole(user);
  const activeHref =
    nav.items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <div className={`app-shell${sidebarClosed ? ' is-sidebar-closed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <Link className="brand" href={nav.items[0]?.href ?? '/'}>
            <span className="brand-mark">A</span>
            <div>
              <div className="brand-name">AVA Globaltec</div>
              <div className="brand-sub">{nav.section}</div>
            </div>
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label="Fechar menu"
            title="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <SidebarCloseIcon />
          </button>
        </div>
        <nav>
          <div className="nav-section-label">{nav.section}</div>
          <ul className="nav-list">
            {nav.items.map((item) => {
              const active = activeHref === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={active ? 'active' : undefined}>
                    <span className="nav-icon">{item.icon}</span> {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <Link
            href="/perfil"
            className={`user-chip user-chip-link${pathname === '/perfil' || pathname.startsWith('/perfil/') ? ' is-active' : ''}`}
            title="Editar meu perfil"
          >
            <div className="avatar">
              {user.hasAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrlFor(user.id)} alt="" className="avatar-img" />
              ) : (
                initials(user.name)
              )}
            </div>
            <div>
              <strong>{user.name}</strong>
              <span>Meu perfil · {user.role}</span>
            </div>
          </Link>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-start">
            {sidebarClosed ? (
              <button
                type="button"
                className="sidebar-toggle sidebar-toggle-open"
                aria-label="Abrir menu"
                title="Abrir menu"
                onClick={() => setSidebarOpen(true)}
              >
                <SidebarOpenIcon />
              </button>
            ) : null}
            <h1 className="topbar-title">
              {titleHref ? (
                <Link className="crumb-link" href={titleHref} title="Voltar ao curso">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h1>
          </div>
          <div className="topbar-actions">
            <NotificationBell
              enabled={
                (user.role === Role.ALUNO || user.role === Role.PROFESSOR) &&
                Boolean(user.hasSchool)
              }
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function SidebarCloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SidebarOpenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
