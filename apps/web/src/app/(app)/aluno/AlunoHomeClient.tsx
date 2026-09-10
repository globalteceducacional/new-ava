'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StudentHomeDashboard } from '@/components/course-view/StudentHomeDashboard';
import { apiFetch } from '@/lib/auth/api';
import type { StudentHomePayload } from '@/lib/course-view/student-home';

export function AlunoHomeClient() {
  const [data, setData] = useState<StudentHomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await apiFetch<StudentHomePayload>('/courses/home');
        setData(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar o início');
      }
    })();
  }, []);

  return (
    <AppShell title="Início">
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!error && !data ? <p className="muted">Carregando seu aprendizado…</p> : null}
      {data ? <StudentHomeDashboard data={data} /> : null}
    </AppShell>
  );
}
