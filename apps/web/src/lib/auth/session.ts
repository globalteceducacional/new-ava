import { Role } from '@ava/shared';

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: (typeof Role)[keyof typeof Role];
  institutionIds: string[];
  /** Escola real (Grade Curricular). Ausente em sessões antigas. */
  hasSchool?: boolean;
  /** Tem foto de perfil. */
  hasAvatar?: boolean;
  permissions: string[];
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

const ACCESS_KEY = 'ava_access_token';
const USER_KEY = 'ava_user';
const SESSION_COOKIE = 'ava_session';
const ROLE_COOKIE = 'ava_role';

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

export function avatarUrlFor(userId: string, cacheKey?: string | number): string {
  const q = cacheKey != null ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
  return `${getApiBaseUrl()}/avatars/${userId}${q}`;
}

/** Legado: token em localStorage (migração — preferir cookie HttpOnly da API). */
export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function persistSession(accessToken: string | null, user: AuthUser): void {
  localStorage.removeItem(ACCESS_KEY);
  if (accessToken) {
    void accessToken;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('ava-session-updated'));
  }
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
  document.cookie = `${ROLE_COOKIE}=; path=/; Max-Age=0`;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('ava-session-updated'));
  }
}

export function homePathForRole(role: AuthUser['role']): string {
  switch (role) {
    case Role.ADM_MASTER:
      return '/master';
    case Role.ADM_INSTITUICAO:
      return '/instituicao';
    case Role.PROFESSOR:
      return '/professor';
    case Role.ALUNO:
    default:
      return '/aluno';
  }
}

/** Home do aluno: dashboard inicial. */
export function homePathForUser(user: AuthUser): string {
  return homePathForRole(user.role);
}

export async function loginRequest(login: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ login, password }),
  });

  if (res.status === 429) {
    throw new Error('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  }
  if (!res.ok) {
    throw new Error('Credenciais inválidas');
  }
  return (await res.json()) as LoginResponse;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* API fora / CORS — ainda limpa o estado local */
  } finally {
    clearSession();
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    return body.accessToken ?? null;
  } catch {
    return null;
  }
}

async function fetchAuthMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: AuthUser };
    return body.user ?? null;
  } catch {
    return null;
  }
}

/** Recupera o usuário pelos cookies HttpOnly (sem depender do localStorage). */
export async function restoreSessionFromCookies(): Promise<AuthUser | null> {
  const first = await fetchAuthMe();
  if (first) return first;
  const renewed = await refreshAccessToken();
  if (!renewed) return null;
  return fetchAuthMe();
}
