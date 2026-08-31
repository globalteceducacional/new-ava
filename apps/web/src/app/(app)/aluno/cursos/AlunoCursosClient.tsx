'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StudentCourseGrid } from '@/components/course-view/StudentCourseGrid';
import { apiFetch } from '@/lib/auth/api';
import type { StudentCourseCard } from '@/lib/course-view/student-courses';

export function AlunoCursosClient() {
  const [items, setItems] = useState<StudentCourseCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<StudentCourseCard[]>('/courses/available');
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar cursos');
      }
    })();
  }, []);

  return (
    <AppShell title="Cursos">
      <div className="page-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Cursos</h1>
          <p>
            Catálogo para assistir quando quiser — sem inscrição. Os cursos obrigatórios da escola
            ficam na Grade Curricular.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!error ? (
        <StudentCourseGrid
          items={items}
          emptyMessage="Nenhum curso publicado disponível no momento."
        />
      ) : null}
    </AppShell>
  );
}
