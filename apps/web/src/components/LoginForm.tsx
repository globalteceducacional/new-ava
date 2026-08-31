'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, homePathForUser, loginRequest, persistSession } from '@/lib/auth/session';

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Backup client-side: se a sessão local existir, não mostra o formulário.
  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      router.replace(homePathForUser(user));
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await loginRequest(login.trim(), password);
      persistSession(data.accessToken, data.user);
      router.replace(homePathForUser(data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: '1.5rem' }}>
      <div className="field">
        <label htmlFor="login">E-mail ou usuário</label>
        <input
          id="login"
          name="login"
          type="text"
          placeholder="aluno@ifma.edu.br"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="row" style={{ marginBottom: '1.25rem' }}>
        <label className="checkbox-row">
          <input type="checkbox" /> Lembrar neste dispositivo
        </label>
        <span className="spacer" />
        <span className="small muted">Esqueci a senha</span>
      </div>
      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }} role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
