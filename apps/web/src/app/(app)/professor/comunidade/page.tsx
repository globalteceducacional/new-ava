'use client';

import { Suspense, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { apiFetch } from '@/lib/auth/api';

async function loadTeacherCourses() {
  const mine = await apiFetch<Array<{ id: string; title: string }>>('/courses/mine');
  return mine.map((c) => ({ id: c.id, title: c.title }));
}

function Feed() {
  const loadCourses = useCallback(() => loadTeacherCourses(), []);
  return <CommunityFeed basePath="/professor/comunidade" loadCourses={loadCourses} />;
}

export default function ProfessorComunidadePage() {
  return (
    <AppShell title="Comunidade">
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Feed />
      </Suspense>
    </AppShell>
  );
}
