'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { COURSE_STATUS_LABELS, type CourseStatus } from '@/lib/admin/types';
import { errorMessage } from '@/lib/format';

type Course = {
  id: string;
  title: string;
  synopsis: string | null;
  status: CourseStatus;
  categories: Array<{ category: { id: string; name: string } }>;
};

export function ProfessorHomeClient() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setCourses(await apiFetch<Course[]>('/courses/mine'));
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar seus cursos'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell title="Painel do professor">
      <div className="page-header">
        <div>
          <p className="eyebrow">Docente</p>
          <h1>Meus cursos</h1>
          <p>Cursos do catálogo em que você está atribuído.</p>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Categorias</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <Link href={`/professor/editor?courseId=${course.id}`}>
                      <strong>{course.title}</strong>
                    </Link>
                    {course.synopsis ? <div className="small muted">{course.synopsis}</div> : null}
                  </td>
                  <td className="small">
                    {course.categories.map((c) => c.category.name).join(', ')}
                  </td>
                  <td>
                    <span
                      className={
                        course.status === 'PUBLISHED' ? 'badge badge-ok' : 'badge badge-warn'
                      }
                    >
                      {COURSE_STATUS_LABELS[course.status] ?? course.status}
                    </span>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/professor/editor?courseId=${course.id}`}
                      >
                        Editar conteúdo
                      </Link>
                      <Link className="btn btn-ghost btn-sm" href="/professor/correcoes">
                        Correções
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? <div className="empty-state">Carregando…</div> : null}
        {!loading && courses.length === 0 ? (
          <div className="empty-state">
            Você ainda não está atribuído a nenhum curso. Um administrador precisa vincular você a
            um curso do catálogo.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
