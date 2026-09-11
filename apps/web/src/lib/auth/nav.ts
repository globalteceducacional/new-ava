import { Role } from '@ava/shared';
import type { AuthUser } from './session';

export type NavItem = { href: string; label: string; icon: string };

export type RoleNav = {
  section: string;
  homeHref: string;
  /** Links visíveis na barra (uma linha). */
  primary: NavItem[];
  /** Links do menu hambúrguer. */
  overflow: NavItem[];
};

export function navForRole(user: AuthUser): RoleNav {
  const role = user.role;
  switch (role) {
    case Role.ADM_MASTER:
      return {
        section: 'Global',
        homeHref: '/master',
        primary: [
          { href: '/master', label: 'Painel', icon: '▣' },
          { href: '/master/catalogo', label: 'Catálogo', icon: '☰' },
          { href: '/master/comunidade', label: 'Comunidades', icon: '◎' },
          { href: '/master/instituicoes', label: 'Instituições', icon: '⌂' },
          { href: '/master/usuarios', label: 'Usuários', icon: '☺' },
          { href: '/master/auditoria', label: 'Auditoria', icon: '◉' },
        ],
        overflow: [],
      };
    case Role.ADM_INSTITUICAO:
      return {
        section: 'Instituição',
        homeHref: '/instituicao',
        primary: [
          { href: '/instituicao', label: 'Painel', icon: '▣' },
          { href: '/instituicao/comunidade', label: 'Comunidades', icon: '◎' },
        ],
        overflow: [
          { href: '/instituicao/vincular', label: 'Vincular cursos', icon: '⇄' },
          { href: '/instituicao/usuarios', label: 'Usuários', icon: '☺' },
        ],
      };
    case Role.PROFESSOR:
      return {
        section: 'Docente',
        homeHref: '/professor',
        primary: [
          { href: '/professor', label: 'Meus cursos', icon: '▣' },
          { href: '/professor/comunidade', label: 'Comunidades', icon: '◎' },
        ],
        overflow: [
          { href: '/professor/editor', label: 'Editor', icon: '✎' },
          { href: '/professor/correcoes', label: 'Correções', icon: '✓' },
        ],
      };
    case Role.ALUNO:
    default: {
      const primary: NavItem[] = [
        { href: '/aluno', label: 'Início', icon: '▣' },
        { href: '/aluno/comunidade', label: 'Comunidades', icon: '◎' },
        { href: '/aluno/certificados', label: 'Certificados', icon: '✎' },
        { href: '/aluno/cursos', label: 'Cursos', icon: '☰' },
      ];
      if (user.hasSchool) {
        primary.push({
          href: '/aluno/grade',
          label: 'Grade Curricular',
          icon: '▤',
        });
      }
      return {
        section: 'Aluno',
        homeHref: '/aluno',
        primary,
        overflow: [],
      };
    }
  }
}

export function allNavItems(nav: RoleNav): NavItem[] {
  return [...nav.primary, ...nav.overflow];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
