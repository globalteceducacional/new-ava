import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Role } from '@ava/shared';

const PROTECTED_PREFIXES = ['/aluno', '/professor', '/instituicao', '/master', '/perfil'];

const ALLOWED_ROLES = new Set<string>(Object.values(Role));

/** Prefixo de rota → roles permitidas. */
const ROLE_GATES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/master', roles: ['ADM_MASTER'] },
  { prefix: '/instituicao', roles: ['ADM_INSTITUICAO'] },
  { prefix: '/professor', roles: ['PROFESSOR'] },
  { prefix: '/aluno', roles: ['ALUNO'] },
];

const ROLE_HOMES: Record<string, string> = {
  ADM_MASTER: '/master',
  ADM_INSTITUICAO: '/instituicao',
  PROFESSOR: '/professor',
  ALUNO: '/aluno',
};

function homeForRole(role: string | undefined): string {
  if (!role || !ALLOWED_ROLES.has(role)) return '/aluno';
  return ROLE_HOMES[role] ?? '/aluno';
}

function trustedRole(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const decoded = decodeURIComponent(raw);
  return ALLOWED_ROLES.has(decoded) ? decoded : undefined;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get('ava_session')?.value;
  const role = trustedRole(request.cookies.get('ava_role')?.value);

  // Já autenticado em /login ou /cadastro → entra direto no painel do perfil.
  if (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/cadastro' ||
    pathname.startsWith('/cadastro/')
  ) {
    if (session) {
      const next = request.nextUrl.searchParams.get('next');
      const dest =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : homeForRole(role);
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (role) {
    const gate = ROLE_GATES.find(
      (g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`),
    );
    if (gate && !gate.roles.includes(role)) {
      return NextResponse.redirect(new URL(homeForRole(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/login/:path*',
    '/cadastro',
    '/cadastro/:path*',
    '/aluno/:path*',
    '/professor/:path*',
    '/instituicao/:path*',
    '/master/:path*',
    '/perfil',
    '/perfil/:path*',
  ],
};
