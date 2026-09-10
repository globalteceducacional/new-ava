'use client';

import { Suspense, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { loadCatalogCoursesForCommunity } from '@/lib/community/load-courses';

function Feed() {
  const loadCourses = useCallback(() => loadCatalogCoursesForCommunity(), []);
  return <CommunityFeed basePath="/master/comunidade" loadCourses={loadCourses} />;
}

export default function MasterComunidadePage() {
  return (
    <AppShell title="Comunidades">
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Feed />
      </Suspense>
    </AppShell>
  );
}
