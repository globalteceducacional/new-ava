'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { avatarUrlFor, getStoredUser, persistSession, type AuthUser } from '@/lib/auth/session';
import { errorMessage } from '@/lib/format';
import { initials } from '@/lib/auth/nav';

type Profile = {
  id: string;
  name: string;
  email: string;
  username: string;
  status: string;
  role: string;
  roleName: string;
  hasAvatar: boolean;
  updatedAt?: string;
  institutions: Array<{ id: string; name: string; slug: string }>;
};

const ROLE_LABELS: Record<string, string> = {
  ADM_MASTER: 'Administrador master',
  ADM_INSTITUICAO: 'Administrador da instituição',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};

export function ProfilePageClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [institutions, setInstitutions] = useState<Profile['institutions']>([]);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState('');
  const [profileId, setProfileId] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const profile = await apiFetch<Profile>('/users/me');
        setProfileId(profile.id);
        setName(profile.name);
        setEmail(profile.email);
        setUsername(profile.username);
        setHasAvatar(Boolean(profile.hasAvatar));
        setAvatarVersion(profile.updatedAt ?? Date.now().toString());
        setRoleLabel(profile.roleName || ROLE_LABELS[profile.role] || profile.role);
        setInstitutions(profile.institutions ?? []);
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar perfil'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onAvatarSelected(file: File | null) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await apiFetch<{ profile: Profile; user: AuthUser }>('/users/me/avatar', {
        method: 'POST',
        body,
      });
      persistSession(null, result.user);
      setHasAvatar(Boolean(result.profile.hasAvatar));
      setAvatarVersion(result.profile.updatedAt ?? Date.now().toString());
      setNotice('Foto de perfil atualizada.');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível enviar a foto'));
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<{ profile: Profile; user: AuthUser }>('/users/me/avatar', {
        method: 'DELETE',
      });
      persistSession(null, result.user);
      setHasAvatar(false);
      setNotice('Foto de perfil removida.');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível remover a foto'));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<{ profile: Profile; user: AuthUser }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, email, username }),
      });
      persistSession(null, {
        ...result.user,
        hasAvatar: result.profile.hasAvatar,
        hasSchool: result.user.hasSchool ?? getStoredUser()?.hasSchool,
      });
      setName(result.profile.name);
      setEmail(result.profile.email);
      setUsername(result.profile.username);
      setHasAvatar(Boolean(result.profile.hasAvatar));
      setNotice('Dados do perfil atualizados.');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível salvar o perfil'));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Senha alterada. Outras sessões ativas foram encerradas; continue nesta.');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível alterar a senha'));
    } finally {
      setBusy(false);
    }
  }

  const stored = getStoredUser();

  return (
    <AppShell title="Meu perfil">
      <div className="page-header">
        <div>
          <p className="eyebrow">Conta</p>
          <h1>Meu perfil</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Atualize seus dados de acesso. O papel e as instituições são definidos pela
            administração.
          </p>
        </div>
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

      {loading ? (
        <div className="panel">
          <div className="empty-state">Carregando…</div>
        </div>
      ) : (
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Foto de perfil</h2>
            </div>
            <div className="panel-body">
              <div className="profile-avatar-row">
                <div className="profile-avatar-preview">
                  {hasAvatar && profileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrlFor(profileId, avatarVersion)} alt="Foto de perfil" />
                  ) : (
                    <span>{initials(name || 'U')}</span>
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <label className="btn btn-secondary btn-sm">
                    {busy ? 'Enviando…' : 'Enviar foto'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = '';
                        void onAvatarSelected(f);
                      }}
                    />
                  </label>
                  {hasAvatar ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void removeAvatar()}
                    >
                      Remover foto
                    </button>
                  ) : null}
                  <p className="hint" style={{ margin: '0.35rem 0 0' }}>
                    JPEG, PNG ou WebP · máximo 5 MB
                  </p>
                </div>
              </div>
            </div>
          </section>

          <form className="panel" onSubmit={saveProfile}>
            <div className="panel-head">
              <h2>Dados pessoais</h2>
            </div>
            <div className="panel-body">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="profile-name">Nome</label>
                  <input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={150}
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profile-username">Usuário</label>
                  <input
                    id="profile-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    maxLength={32}
                    disabled={busy}
                    autoComplete="username"
                  />
                  <p className="hint">
                    3–32 caracteres: minúsculas, números, ponto, hífen ou underscore.
                  </p>
                </div>
              </div>
              <div className="field">
                <label htmlFor="profile-email">E-mail</label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={180}
                  disabled={busy}
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label>Papel</label>
                <input value={roleLabel} disabled readOnly />
              </div>
              {institutions.length ? (
                <div className="field">
                  <label>Instituições</label>
                  <div className="row" style={{ gap: '0.35rem' }}>
                    {institutions.map((i) => (
                      <span key={i.id} className="badge">
                        {i.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar dados'}
              </button>
            </div>
          </form>

          <form className="panel" onSubmit={changePassword}>
            <div className="panel-head">
              <h2>Alterar senha</h2>
            </div>
            <div className="panel-body">
              <div className="field">
                <label htmlFor="profile-current-password">Senha atual</label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={busy}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="profile-new-password">Nova senha</label>
                  <input
                    id="profile-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label htmlFor="profile-confirm-password">Confirmar nova senha</label>
                  <input
                    id="profile-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="hint">
                Mínimo 6 caracteres. Ao trocar a senha, outras sessões são encerradas
                {stored ? ` (conta ${stored.username})` : ''}.
              </p>
              <button className="btn btn-secondary" type="submit" disabled={busy}>
                Alterar senha
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
