import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/aluno', '/professor', '/instituicao', '/master', '/perfil'];

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
  ALUNO: '/aluno/cursos',
};

function homeForRole(role: string | undefined): string {
  if (!role) return '/aluno/cursos';
  return ROLE_HOMES[role] ?? '/aluno/cursos';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get('ava_session')?.value;
  const role = request.cookies.get('ava_role')?.value;

  // Já autenticado em /login → entra direto no painel do perfil.
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    if (session) {
      const next = request.nextUrl.searchParams.get('next');
      const dest =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : homeForRole(role ? decodeURIComponent(role) : undefined);
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
    const decodedRole = decodeURIComponent(role);
    const gate = ROLE_GATES.find(
      (g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`),
    );
    if (gate && !gate.roles.includes(decodedRole)) {
      return NextResponse.redirect(new URL(homeForRole(decodedRole), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/login/:path*',
    '/aluno/:path*',
    '/professor/:path*',
    '/instituicao/:path*',
    '/master/:path*',
    '/perfil',
    '/perfil/:path*',
  ],
};
