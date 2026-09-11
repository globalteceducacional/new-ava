'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getStoredUser,
  homePathForUser,
  persistSession,
  registerRequest,
} from '@/lib/auth/session';

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      router.replace(homePathForUser(user));
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      setError('Os e-mails não coincidem');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    setLoading(true);
    try {
      const data = await registerRequest(
        name.trim(),
        email.trim(),
        emailConfirm.trim(),
        password,
      );
      persistSession(data.accessToken, data.user);
      router.replace(homePathForUser(data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no cadastro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: '1.5rem' }}>
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={150}
        />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="voce@email.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="emailConfirm">Confirmar e-mail</label>
        <input
          id="emailConfirm"
          name="emailConfirm"
          type="email"
          placeholder="Repita o e-mail"
          autoComplete="off"
          value={emailConfirm}
          onChange={(e) => setEmailConfirm(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="mínimo 6 caracteres"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          maxLength={128}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar senha</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          maxLength={128}
        />
      </div>
      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }} role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
        {loading ? 'Criando conta…' : 'Criar conta'}
      </button>
    </form>
  );
}
