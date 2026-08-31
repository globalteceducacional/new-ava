'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';

type Activity = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
};

export default function AlunoAtividadePage() {
  const params = useParams<{ id: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<Activity>(`/activities/${params.id}`);
        setActivity(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar');
      }
    })();
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/activities/${params.id}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setMessage('Entrega enviada. Aguarde a correção do professor.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na entrega');
    }
  }

  return (
    <AppShell title={activity?.title ?? 'Atividade'}>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}
      {activity ? (
        <>
          <div className="page-header">
            <div>
              <p className="eyebrow">Atividade</p>
              <h1>{activity.title}</h1>
              <p>{activity.description ?? 'Sem descrição.'}</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="panel" style={{ padding: '1rem' }}>
            <div className="field">
              <label htmlFor="text">Sua entrega (texto)</label>
              <textarea
                id="text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Entregar
            </button>
          </form>
        </>
      ) : null}
    </AppShell>
  );
}
