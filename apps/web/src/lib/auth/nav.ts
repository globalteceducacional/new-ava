import { Role } from '@ava/shared';
import type { AuthUser } from './session';

export type NavItem = { href: string; label: string; icon: string };

export function navForRole(user: AuthUser): {
  section: string;
  items: NavItem[];
} {
  const role = user.role;
  switch (role) {
    case Role.ADM_MASTER:
      return {
        section: 'Global',
        items: [
          { href: '/master', label: 'Painel', icon: '▣' },
          { href: '/master/instituicoes', label: 'Instituições', icon: '⌂' },
          { href: '/master/usuarios', label: 'Usuários', icon: '☺' },
          { href: '/master/catalogo', label: 'Catálogo', icon: '☰' },
          { href: '/master/auditoria', label: 'Auditoria', icon: '◎' },
        ],
      };
    case Role.ADM_INSTITUICAO:
      return {
        section: 'Instituição',
        items: [
          { href: '/instituicao', label: 'Painel', icon: '▣' },
          { href: '/instituicao/vincular', label: 'Vincular cursos', icon: '⇄' },
          { href: '/instituicao/usuarios', label: 'Usuários', icon: '☺' },
        ],
      };
    case Role.PROFESSOR: {
      return {
        section: 'Docente',
        items: [
          { href: '/professor', label: 'Meus cursos', icon: '▣' },
          { href: '/professor/editor', label: 'Editor', icon: '✎' },
          { href: '/professor/correcoes', label: 'Correções', icon: '✓' },
          { href: '/professor/comunidade', label: 'Comunidade', icon: '◎' },
        ],
      };
    }
    case Role.ALUNO:
    default: {
      const items: NavItem[] = [];
      if (user.hasSchool) {
        items.push({
          href: '/aluno/grade',
          label: 'Grade Curricular',
          icon: '▤',
        });
      }
      items.push(
        { href: '/aluno/cursos', label: 'Cursos', icon: '☰' },
        { href: '/aluno/certificados', label: 'Certificados', icon: '✎' },
        { href: '/aluno/comunidade', label: 'Comunidade', icon: '◎' },
      );
      return {
        section: 'Aluno',
        items,
      };
    }
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
