'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { getContinueLessonId } from '@/lib/course-view/lesson-progress';
import { errorMessage } from '@/lib/format';

type ModuleRow = {
  id: string;
  videos: Array<{ id: string }>;
};

function pickLessonId(modules: ModuleRow[]): string | null {
  for (const mod of modules) {
    const ids = mod.videos.map((v) => v.id);
    const next = getContinueLessonId(mod.id, ids);
    if (next) return next;
  }
  return null;
}

/** Encaminha direto para a aula (visão do aluno), sem a página de pré-edição. */
export default function ProfessorCourseOpenPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = params.id;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    void (async () => {
      try {
        const modules = await apiFetch<ModuleRow[]>(`/courses/${courseId}/modules`);
        if (cancelled) return;
        const lessonId = pickLessonId(modules);
        if (lessonId) {
          router.replace(`/professor/cursos/${courseId}/aula/${lessonId}`);
          return;
        }
        setError('Este curso ainda não tem aulas para visualizar.');
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e, 'Não foi possível abrir o curso'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, router]);

  return (
    <AppShell title="Curso">
      {error ? (
        <div className="panel">
          <div className="alert alert-danger">{error}</div>
          <Link className="btn btn-secondary" href="/professor">
            Voltar aos cursos
          </Link>
        </div>
      ) : (
        <div className="panel">
          <div className="empty-state">Abrindo a aula…</div>
        </div>
      )}
    </AppShell>
  );
}
