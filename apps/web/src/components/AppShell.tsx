'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NotificationBell } from '@/components/NotificationBell';
import { allNavItems, initials, navForRole, type NavItem } from '@/lib/auth/nav';
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

type AppShellProps = {
  title: string;
  titleHref?: string;
  /** Página pública: mostra a barra mesmo sem sessão (ex.: verificar certificado). */
  allowGuest?: boolean;
  children: React.ReactNode;
};

const GUEST_NAV = {
  section: 'Visitante',
  homeHref: '/login',
  primary: [] as NavItem[],
  overflow: [{ href: '/login', label: 'Entrar', icon: '→' }] as NavItem[],
};

export function AppShell({ title, titleHref, allowGuest = false, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      if (!allowGuest) {
        clearSession();
        router.replace('/login');
        return;
      }
      setUser(null);
      setReady(true);
      return;
    }
    setUser(stored);
    setReady(true);

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
  }, [router, pathname, allowGuest]);

  useEffect(() => {
    function onSessionUpdated() {
      const stored = getStoredUser();
      setUser(stored);
    }
    window.addEventListener('ava-session-updated', onSessionUpdated);
    return () => window.removeEventListener('ava-session-updated', onSessionUpdated);
  }, []);

  async function onLogout() {
    await logoutRequest();
    router.replace('/login');
  }

  if (!ready || (!user && !allowGuest)) {
    return (
      <div className="auth-panel" style={{ minHeight: '100vh' }}>
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  const nav = user ? navForRole(user) : GUEST_NAV;
  const items = allNavItems(nav);
  const activeHref =
    items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const notifyEnabled =
    Boolean(user) &&
    (user.role === Role.ALUNO || user.role === Role.PROFESSOR) &&
    Boolean(user.hasSchool);

  function linkClass(item: NavItem) {
    return activeHref === item.href ? 'active' : undefined;
  }

  return (
    <div className="app-shell is-top-nav">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="top-nav-start" ref={menuRef}>
            {nav.overflow.length ? (
              <>
                <button
                  type="button"
                  className="top-nav-burger"
                  aria-label="Mais opções"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <HamburgerIcon />
                </button>
                {menuOpen ? (
                  <div className="top-nav-drawer" role="menu">
                    <p className="top-nav-drawer-label">{nav.section}</p>
                    <ul>
                      {nav.overflow.map((item) => (
                        <li key={item.href}>
                          <Link href={item.href} className={linkClass(item)} role="menuitem">
                            <span className="nav-icon">{item.icon}</span> {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
            <Link className="brand top-nav-brand" href={nav.homeHref}>
              <span className="brand-mark">A</span>
              <div>
                <div className="brand-name">AVA Globaltec</div>
                <div className="brand-sub">{nav.section}</div>
              </div>
            </Link>
          </div>

          <nav className="top-nav-desktop" aria-label="Principal">
            <ul className="top-nav-list">
              {nav.primary.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass(item)}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="top-nav-end">
            {user ? (
              <>
                <NotificationBell enabled={notifyEnabled} />
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
                    <span>Meu perfil</span>
                  </div>
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
                  Sair
                </button>
              </>
            ) : (
              <Link className="btn btn-secondary btn-sm" href="/login">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="content top-nav-content">
        {titleHref ? (
          <p className="top-nav-crumb">
            <Link className="crumb-link" href={titleHref}>
              ← {title}
            </Link>
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
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
