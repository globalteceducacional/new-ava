'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/auth/api';
import {
  ROLE_LABELS,
  type AdminUser,
  type Institution,
  type Paginated,
  type RoleCode,
} from '@/lib/admin/types';
import { errorMessage, formatDate } from '@/lib/format';

const PAGE_SIZE = 20;
const ROLE_OPTIONS: RoleCode[] = ['ALUNO', 'PROFESSOR', 'ADM_INSTITUICAO', 'ADM_MASTER'];

type Filters = {
  role: RoleCode | '';
  institutionId: string;
  q: string;
};

type FormState = {
  name: string;
  email: string;
  username: string;
  password: string;
  role: RoleCode;
  institutionIds: string[];
};

function emptyForm(defaultInstitutionId?: string): FormState {
  return {
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'ALUNO',
    institutionIds: defaultInstitutionId ? [defaultInstitutionId] : [],
  };
}

export function UsuariosPageClient() {
  const searchParams = useSearchParams();
  const roleFromUrl = searchParams.get('role') as RoleCode | null;

  const [filters, setFilters] = useState<Filters>({
    role: roleFromUrl ?? '',
    institutionId: '',
    q: '',
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [showPasswordEdit, setShowPasswordEdit] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.role) params.set('role', filters.role);
    if (filters.institutionId) params.set('institutionId', filters.institutionId);
    if (filters.q) params.set('q', filters.q);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return params.toString();
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Paginated<AdminUser>>(`/users?${query}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar usuários'));
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
        // Lista de instituições é opcional para a listagem; erro aparece ao salvar.
      }
    })();
  }, []);

  // Debounce da busca para não disparar uma requisição por tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === search ? prev : { ...prev, q: search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  function updateFilter(patch: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function resetPasswordEdit() {
    setShowPasswordEdit(false);
    setEditPassword('');
    setEditPasswordConfirm('');
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(filters.institutionId || institutions[0]?.id));
    setFormError(null);
    resetPasswordEdit();
    setModalOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
      role: user.role,
      institutionIds: user.institutions.map((i) => i.id),
    });
    setFormError(null);
    resetPasswordEdit();
    setModalOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const needsInstitution = form.role !== 'ADM_MASTER';
    if (needsInstitution && form.institutionIds.length === 0) {
      setFormError('Selecione ao menos uma instituição para este papel.');
      return;
    }

    if (editing && showPasswordEdit) {
      if (editPassword.length < 6) {
        setFormError('A nova senha deve ter no mínimo 6 caracteres.');
        return;
      }
      if (editPassword !== editPasswordConfirm) {
        setFormError('A confirmação da senha não confere.');
        return;
      }
    }

    setBusy(true);
    try {
      if (editing) {
        await apiFetch(`/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            username: form.username,
            role: form.role,
            institutionIds: needsInstitution ? form.institutionIds : [],
          }),
        });
        if (showPasswordEdit) {
          await apiFetch(`/users/${editing.id}/password`, {
            method: 'POST',
            body: JSON.stringify({ password: editPassword }),
          });
        }
        setNotice(
          showPasswordEdit
            ? `Usuário "${form.name}" atualizado e senha redefinida.`
            : `Usuário "${form.name}" atualizado.`,
        );
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            username: form.username,
            password: form.password,
            role: form.role,
            institutionIds: needsInstitution ? form.institutionIds : [],
          }),
        });
        setNotice(`Usuário "${form.name}" criado.`);
      }
      setModalOpen(false);
      resetPasswordEdit();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, 'Não foi possível salvar o usuário'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: AdminUser) {
    const ok = window.confirm(
      `Excluir "${user.name}"? O histórico é preservado, mas o acesso é encerrado.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      await apiFetch(`/users/${user.id}`, { method: 'DELETE' });
      setNotice(`Usuário "${user.name}" excluído.`);
      setError(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível excluir o usuário'));
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items ?? [];
  const showInstitutionPicker = form.role !== 'ADM_MASTER';

  return (
    <AppShell title="Usuários">
      <div className="page-header">
        <div>
          <p className="eyebrow">Gestão global</p>
          <h1>Usuários</h1>
          <p>
            Crie e administre alunos, professores e administradores, e defina a que instituições
            cada pessoa pertence.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo usuário
        </button>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      ) : null}

      <div className="panel">
        <div className="toolbar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou usuário"
            aria-label="Buscar usuários"
            style={{ minWidth: 260 }}
          />
          <select
            value={filters.role}
            onChange={(e) => updateFilter({ role: e.target.value as Filters['role'] })}
            aria-label="Filtrar por papel"
          >
            <option value="">Todos os papéis</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <select
            value={filters.institutionId}
            onChange={(e) => updateFilter({ institutionId: e.target.value })}
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
          <span className="small muted">{data?.total ?? 0} usuário(s)</span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Acesso</th>
                <th>Papel</th>
                <th>Instituições</th>
                <th>Vínculos</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <div className="small muted">{user.email}</div>
                  </td>
                  <td>
                    <code>{user.username}</code>
                  </td>
                  <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td>
                    {user.institutions.length === 0 ? (
                      <span className="muted small">Global</span>
                    ) : (
                      <span className="small">
                        {user.institutions.map((i) => i.name).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="small">
                    {user.role === 'PROFESSOR'
                      ? `${user.teachingCount} curso(s)`
                      : user.role === 'ALUNO'
                        ? `${user.enrollmentCount} matrícula(s)`
                        : '—'}
                  </td>
                  <td className="small">{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(user)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        disabled={busy}
                        onClick={() => void remove(user)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <div className="empty-state">Carregando…</div> : null}
        {!loading && items.length === 0 ? (
          <div className="empty-state">Nenhum usuário encontrado com os filtros atuais.</div>
        ) : null}

        {data && data.pageCount > 1 ? (
          <div
            className="toolbar"
            style={{ borderTop: '1px solid var(--line)', borderBottom: 'none' }}
          >
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

      <Modal
        open={modalOpen}
        title={editing ? `Editar ${editing.name}` : 'Novo usuário'}
        onClose={() => {
          setModalOpen(false);
          resetPasswordEdit();
        }}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={submit}>
          {formError ? (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              {formError}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="user-name">Nome completo</label>
            <input
              id="user-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={150}
            />
          </div>

          <div className="field">
            <label htmlFor="user-email">E-mail</label>
            <input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              maxLength={180}
            />
          </div>

          <div className="field">
            <label htmlFor="user-username">Usuário de login</label>
            <input
              id="user-username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              pattern="[a-z0-9][a-z0-9._\-]{2,31}"
              required
            />
            <span className="hint">
              3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou underscore.
            </span>
          </div>

          {!editing ? (
            <div className="field">
              <label htmlFor="user-password">Senha inicial</label>
              <input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required
                autoComplete="new-password"
              />
              <span className="hint">
                Mínimo de 6 caracteres. O usuário poderá trocá-la depois.
              </span>
            </div>
          ) : showPasswordEdit ? (
            <>
              <div className="field">
                <label htmlFor="user-new-password">Nova senha</label>
                <input
                  id="user-new-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label htmlFor="user-new-password-confirm">Confirmar nova senha</label>
                <input
                  id="user-new-password-confirm"
                  type="password"
                  value={editPasswordConfirm}
                  onChange={(e) => setEditPasswordConfirm(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
                <span className="hint">
                  Mínimo de 6 caracteres. As sessões ativas serão encerradas.
                </span>
              </div>
              <div className="field">
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetPasswordEdit}>
                  Cancelar alteração de senha
                </button>
              </div>
            </>
          ) : (
            <div className="field">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPasswordEdit(true)}
              >
                Alterar senha
              </button>
            </div>
          )}

          <div className="field">
            <label htmlFor="user-role">Papel de acesso</label>
            <select
              id="user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as RoleCode })}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>

          {showInstitutionPicker ? (
            <div className="field">
              <label>Instituições</label>
              <div className="stack" style={{ gap: '0.35rem' }}>
                {institutions.map((institution) => {
                  const checked = form.institutionIds.includes(institution.id);
                  return (
                    <label key={institution.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            institutionIds: e.target.checked
                              ? [...prev.institutionIds, institution.id]
                              : prev.institutionIds.filter((id) => id !== institution.id),
                          }))
                        }
                      />
                      {institution.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="alert alert-info">
              Administradores master têm acesso global e não pertencem a uma instituição específica.
            </div>
          )}
        </form>
      </Modal>
    </AppShell>
  );
}
