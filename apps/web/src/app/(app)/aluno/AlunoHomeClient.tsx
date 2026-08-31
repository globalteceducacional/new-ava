'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StudentCourseGrid } from '@/components/course-view/StudentCourseGrid';
import { apiFetch } from '@/lib/auth/api';
import type { StudentCourseCard } from '@/lib/course-view/student-courses';

type MineItem = StudentCourseCard & {
  enrollmentId: string;
  enrolledAt: string;
  institution: { name: string; slug: string };
};

export function AlunoHomeClient() {
  const [items, setItems] = useState<MineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<MineItem[]>('/courses/mine');
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar cursos');
      }
    })();
  }, []);

  return (
    <AppShell title="Meus cursos">
      <div className="page-header">
        <div>
          <p className="eyebrow">{items[0]?.institution.name ?? 'Instituição'}</p>
          <h1>Meus cursos</h1>
          <p>
            Cursos opcionais em que você se inscreveu. A grade obrigatória da escola fica em Grade
            Curricular.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!error ? (
        <StudentCourseGrid
          items={items}
          emptyMessage="Você ainda não se inscreveu em nenhum curso opcional. Veja a aba Cursos."
        />
      ) : null}
    </AppShell>
  );
}
