'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import type { AuditEntry, Institution, Paginated } from '@/lib/admin/types';
import { errorMessage, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login bem-sucedido',
  LOGIN_FAIL: 'Falha de login',
  LOGOUT: 'Logout',
  USER_CREATE: 'Usuário criado',
  USER_UPDATE: 'Usuário atualizado',
  USER_DELETE: 'Usuário excluído',
  USER_PASSWORD_RESET: 'Senha redefinida',
  INSTITUTION_CREATE: 'Instituição criada',
  INSTITUTION_UPDATE: 'Instituição atualizada',
  INSTITUTION_DELETE: 'Instituição excluída',
  COURSE_CREATE: 'Curso criado',
  COURSE_UPDATE: 'Curso atualizado',
  COURSE_DELETE: 'Curso excluído',
  COURSE_STATUS_CHANGE: 'Status do curso alterado',
  ENROLLMENT_CREATE: 'Matrícula criada',
  ENROLLMENT_DELETE: 'Matrícula removida',
  TEACHER_ASSIGN: 'Professor atribuído',
  TEACHER_UNASSIGN: 'Professor removido',
  INSTITUTION_COURSE_LINK: 'Curso vinculado à instituição',
  INSTITUTION_COURSE_UNLINK: 'Curso desvinculado da instituição',
};

const ACTION_TONE: Record<string, string> = {
  LOGIN_FAIL: 'badge badge-danger',
  USER_DELETE: 'badge badge-danger',
  INSTITUTION_DELETE: 'badge badge-danger',
  COURSE_DELETE: 'badge badge-danger',
  ENROLLMENT_DELETE: 'badge badge-warn',
  TEACHER_UNASSIGN: 'badge badge-warn',
  INSTITUTION_COURSE_UNLINK: 'badge badge-warn',
  LOGIN_SUCCESS: 'badge badge-ok',
};

export function AuditoriaPageClient() {
  const [action, setAction] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (institutionId) params.set('institutionId', institutionId);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return params.toString();
  }, [action, institutionId, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Paginated<AuditEntry>>(`/admin/audit?${query}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar a auditoria'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        setInstitutions(await apiFetch<Institution[]>('/institutions'));
      } catch {
        // Filtro por instituição é opcional.
      }
    })();
  }, []);

  const items = data?.items ?? [];

  return (
    <AppShell title="Auditoria">
      <div className="page-header">
        <div>
          <p className="eyebrow">Rastreabilidade</p>
          <h1>Auditoria</h1>
          <p>
            Registro de acessos e de alterações administrativas, em ordem cronológica decrescente.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}

      <div className="panel">
        <div className="toolbar">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por ação"
          >
            <option value="">Todas as ações</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={institutionId}
            onChange={(e) => {
              setInstitutionId(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por instituição"
          >
            <option value="">Todas as instituições</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <span className="small muted">{data?.total ?? 0} evento(s)</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Ação</th>
                <th>Responsável</th>
                <th>Instituição</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id}>
                  <td className="small">{formatDateTime(entry.createdAt)}</td>
                  <td>
                    <span className={ACTION_TONE[entry.action] ?? 'badge'}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className="small">
                    {entry.actor ? (
                      <>
                        <strong>{entry.actor.name}</strong>
                        <div className="muted">{entry.actor.username}</div>
                      </>
                    ) : (
                      <span className="muted">Sistema</span>
                    )}
                  </td>
                  <td className="small">{entry.institution?.name ?? '—'}</td>
                  <td className="small muted">{summarize(entry.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <div className="empty-state">Carregando…</div> : null}
        {!loading && items.length === 0 ? (
          <div className="empty-state">Nenhum evento com os filtros atuais.</div>
        ) : null}

        {data && data.pageCount > 1 ? (
          <div className="toolbar" style={{ borderBottom: 'none' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="small muted">
              Página {data.page} de {data.pageCount}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= data.pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

/** Metadata é JSON livre; mostra pares chave=valor curtos. */
function summarize(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '—';
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${stringify(value)}`);
  return entries.length ? entries.join(' · ') : '—';
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 3).join(', ');
  if (typeof value === 'object') return '…';
  return String(value);
}
