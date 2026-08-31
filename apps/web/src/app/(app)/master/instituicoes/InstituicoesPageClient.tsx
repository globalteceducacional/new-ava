'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/auth/api';
import type { Institution } from '@/lib/admin/types';
import { errorMessage, formatDate } from '@/lib/format';

type FormState = {
  name: string;
  slug: string;
  status: 'ACTIVE' | 'INACTIVE';
};

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  status: 'ACTIVE',
};

export function InstituicoesPageClient() {
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<Institution | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiFetch<Institution[]>('/institutions'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar instituições'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(institution: Institution) {
    setEditing(institution);
    setForm({
      name: institution.name,
      slug: institution.slug,
      status: institution.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      name: form.name,
      status: form.status,
    };
    // Slug vazio na criação deixa a API derivar do nome.
    if (form.slug.trim()) payload.slug = form.slug.trim();

    try {
      if (editing) {
        await apiFetch(`/institutions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(`Instituição "${form.name}" atualizada.`);
      } else {
        await apiFetch('/institutions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Instituição "${form.name}" criada.`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, 'Não foi possível salvar a instituição'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(institution: Institution) {
    const ok = window.confirm(
      `Excluir a instituição "${institution.name}"? Esta ação também desativa os vínculos de curso.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      await apiFetch(`/institutions/${institution.id}`, { method: 'DELETE' });
      setNotice(`Instituição "${institution.name}" excluída.`);
      setError(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível excluir a instituição'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Instituições">
      <div className="page-header">
        <div>
          <p className="eyebrow">Gestão global</p>
          <h1>Instituições</h1>
          <p>
            Organizações (escolas/faculdades). Os logins de administrador (ex.:{' '}
            <code>instituição</code>) são usuários — aparecem abaixo como gestores e também em{' '}
            <Link href="/master/usuarios?role=ADM_INSTITUICAO">Usuários</Link>.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Nova instituição
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
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Instituição</th>
                <th>Gestores</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Pessoas</th>
                <th>Cursos</th>
                <th>Matrículas</th>
                <th>Criada em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((institution) => (
                <tr key={institution.id}>
                  <td>
                    <strong>{institution.name}</strong>
                  </td>
                  <td>
                    {(institution.admins?.length ?? 0) === 0 ? (
                      <span className="muted small">Nenhum gestor</span>
                    ) : (
                      <ul
                        className="stack"
                        style={{ gap: '0.15rem', margin: 0, padding: 0, listStyle: 'none' }}
                      >
                        {institution.admins!.map((admin) => (
                          <li key={admin.id} className="small">
                            <strong>{admin.name}</strong>
                            <div className="muted">
                              login: <code>{admin.username}</code>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    <code>{institution.slug}</code>
                  </td>
                  <td>
                    <span
                      className={
                        institution.status === 'ACTIVE' ? 'badge badge-ok' : 'badge badge-warn'
                      }
                    >
                      {institution.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td>{institution.memberCount}</td>
                  <td>{institution.courseCount}</td>
                  <td>{institution.enrollmentCount}</td>
                  <td>{formatDate(institution.createdAt)}</td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(institution)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        disabled={busy}
                        onClick={() => void remove(institution)}
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
        {!loading && items.length === 0 ? (
          <div className="empty-state">
            Nenhuma instituição cadastrada. Crie a primeira para começar a vincular cursos e
            matricular alunos.
          </div>
        ) : null}
        {loading ? <div className="empty-state">Carregando…</div> : null}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar instituição' : 'Nova instituição'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="institution-form"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="institution-form" onSubmit={submit}>
          {formError ? (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              {formError}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="inst-name">Nome</label>
            <input
              id="inst-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: IFMA — Campus Monte Castelo"
              required
              maxLength={180}
            />
          </div>

          <div className="field">
            <label htmlFor="inst-slug">Identificador (slug)</label>
            <input
              id="inst-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="ifma-monte-castelo"
              pattern="[a-z0-9][a-z0-9\-]{1,49}"
            />
            <span className="hint">
              Deixe em branco para gerar automaticamente a partir do nome.
            </span>
          </div>

          <div className="field">
            <label htmlFor="inst-status">Status</label>
            <select
              id="inst-status"
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as FormState['status'],
                })
              }
            >
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </select>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
