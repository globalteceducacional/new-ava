'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StudentCourseGrid } from '@/components/course-view/StudentCourseGrid';
import { apiFetch } from '@/lib/auth/api';
import type { StudentCourseCard } from '@/lib/course-view/student-courses';

type CurriculumItem = StudentCourseCard & {
  enrollmentId: string;
  enrolledAt: string;
  source: string;
  institution: { name: string; slug: string };
};

export function AlunoGradeClient() {
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<CurriculumItem[]>('/courses/curriculum');
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar a grade curricular');
      }
    })();
  }, []);

  return (
    <AppShell title="Grade Curricular">
      <div className="page-header">
        <div>
          <p className="eyebrow">{items[0]?.institution.name ?? 'Sua instituição'}</p>
          <h1>Grade Curricular</h1>
          <p>
            Cursos obrigatórios alocados pela sua instituição ou professor. Abra e assista — sem
            inscrição. Os demais cursos ficam em Cursos.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!error ? (
        <StudentCourseGrid
          items={items}
          enrolledLabel="Obrigatório"
          emptyMessage="Nenhum curso na sua grade ainda. Quando a instituição ou o professor alocar um curso, ele aparece aqui."
        />
      ) : null}
    </AppShell>
  );
}
