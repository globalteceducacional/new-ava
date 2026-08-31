'use client';

import { Suspense, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { apiFetch } from '@/lib/auth/api';

async function loadStudentCourses() {
  const mine = await apiFetch<Array<{ course: { id: string; title: string } }>>(
    '/courses/mine?for=community',
  );
  return mine.map((m) => ({ id: m.course.id, title: m.course.title }));
}

function Feed() {
  const loadCourses = useCallback(() => loadStudentCourses(), []);
  return <CommunityFeed basePath="/aluno/comunidade" loadCourses={loadCourses} />;
}

export default function AlunoComunidadePage() {
  return (
    <AppShell title="Comunidade">
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Feed />
      </Suspense>
    </AppShell>
  );
}
