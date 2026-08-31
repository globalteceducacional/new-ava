'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { getStoredUser } from '@/lib/auth/session';
import type { AdminOverview, AuditEntry, Paginated } from '@/lib/admin/types';
import { errorMessage, formatDateTime } from '@/lib/format';

const AUDIT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login',
  USER_CREATE: 'Usuário criado',
  USER_UPDATE: 'Usuário atualizado',
  USER_DELETE: 'Usuário excluído',
  USER_PASSWORD_RESET: 'Senha redefinida',
  ENROLLMENT_CREATE: 'Matrícula criada',
  ENROLLMENT_DELETE: 'Matrícula removida',
  TEACHER_ASSIGN: 'Professor atribuído',
  TEACHER_UNASSIGN: 'Professor removido',
  INSTITUTION_COURSE_LINK: 'Curso vinculado',
  INSTITUTION_COURSE_UNLINK: 'Curso desvinculado',
};

export function InstituicaoHomeClient() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [instName, setInstName] = useState('Instituição');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, audit, institutions] = await Promise.all([
        apiFetch<AdminOverview>('/admin/overview'),
        apiFetch<Paginated<AuditEntry>>('/admin/audit?pageSize=8'),
        apiFetch<Array<{ id: string; name: string }>>('/institutions'),
      ]);
      setOverview(stats);
      setRecent(audit.items);
      if (institutions[0]?.name) setInstName(institutions[0].name);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar o painel'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const user = getStoredUser();

  return (
    <AppShell title="Instituição">
      <div className="page-header">
        <div>
          <p className="eyebrow">{instName}</p>
          <h1>Painel da instituição</h1>
          <p>
            Vincule cursos do catálogo e gerencie alunos e professores
            {user?.name ? ` · ${user.name}` : ''}.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-secondary btn-sm" href="/instituicao/usuarios">
            Usuários
          </Link>
          <Link className="btn btn-primary btn-sm" href="/instituicao/vincular">
            Vincular cursos
          </Link>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}

      {loading && !overview ? (
        <div className="panel">
          <div className="empty-state">Carregando indicadores…</div>
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid-4" style={{ marginBottom: '1rem' }}>
            <StatCard
              label="Alunos"
              value={overview.students}
              hint={`${overview.enrollments} matrículas ativas`}
              href="/instituicao/usuarios?role=ALUNO"
            />
            <StatCard
              label="Professores"
              value={overview.teachers}
              hint="Docentes da instituição"
              href="/instituicao/usuarios?role=PROFESSOR"
            />
            <StatCard
              label="Cursos vinculados"
              value={overview.courses.total}
              hint={`${overview.courses.published} publicados`}
              href="/instituicao/vincular"
            />
            <StatCard
              label="Pendências"
              value={overview.pendingSubmissions}
              hint="Entregas aguardando correção"
            />
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <h2>Pontos de atenção</h2>
              </div>
              <div className="panel-body stack">
                <AttentionRow
                  label="Cursos vinculados sem professor"
                  value={overview.courses.withoutTeacher}
                  href="/instituicao/vincular"
                />
                <AttentionRow
                  label="Entregas aguardando correção"
                  value={overview.pendingSubmissions}
                />
                <AttentionRow
                  label="Cursos em rascunho (ainda vinculados)"
                  value={overview.courses.draft}
                  href="/instituicao/vincular"
                />
                <p className="small muted" style={{ margin: 0 }}>
                  {overview.recentLogins} logins na instituição nos últimos 7 dias.
                </p>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Atividade recente</h2>
              </div>
              <div className="panel-body">
                {recent.length === 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    Nenhum evento registrado ainda.
                  </p>
                ) : (
                  <ul className="timeline">
                    {recent.map((entry) => (
                      <li key={entry.id}>
                        <time>{formatDateTime(entry.createdAt)}</time>
                        <span>
                          <strong>{AUDIT_LABELS[entry.action] ?? entry.action}</strong>
                          {entry.actor ? ` — ${entry.actor.name}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href?: string;
}) {
  const body = (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

function AttentionRow({ label, value, href }: { label: string; value: number; href?: string }) {
  const badgeClass = value > 0 ? 'badge badge-warn' : 'badge badge-ok';
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span>{href ? <Link href={href}>{label}</Link> : label}</span>
      <span className={badgeClass}>{value}</span>
    </div>
  );
}
