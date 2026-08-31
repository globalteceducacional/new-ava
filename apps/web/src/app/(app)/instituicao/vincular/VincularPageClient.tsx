'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';

type Institution = { id: string; name: string; slug: string };
type Course = {
  id: string;
  title: string;
  status: string;
  categories: Array<{ category: { name: string } }>;
};
type LinkRow = {
  id: string;
  courseId: string;
  active: boolean;
  course: Course;
};

export function VincularPageClient() {
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const institutions = await apiFetch<Institution[]>('/institutions');
      const inst = institutions[0];
      if (!inst) {
        setError('Nenhuma instituição encontrada para este usuário');
        return;
      }
      setInstitution(inst);
      const [courses, linked] = await Promise.all([
        apiFetch<Course[]>('/courses/linkable'),
        apiFetch<LinkRow[]>(`/institutions/${inst.id}/courses`),
      ]);
      setCatalog(courses);
      setLinks(linked);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeByCourse = new Map(links.filter((l) => l.active).map((l) => [l.courseId, l]));

  async function toggle(courseId: string, linked: boolean) {
    if (!institution) return;
    setBusy(true);
    try {
      if (linked) {
        await apiFetch(`/institutions/${institution.id}/courses/${courseId}`, {
          method: 'DELETE',
        });
      } else {
        await apiFetch(`/institutions/${institution.id}/courses`, {
          method: 'POST',
          body: JSON.stringify({ courseIds: [courseId] }),
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar vínculo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Vincular cursos">
      <div className="page-header">
        <div>
          <p className="eyebrow">{institution?.name ?? 'Instituição'}</p>
          <h1>Vincular cursos do catálogo</h1>
          <p>
            Marque os cursos que sua instituição oferece. Ao vincular, alunos ativos são
            matriculados automaticamente.
          </p>
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
                <th>Vinculado</th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Nenhum curso publicado/rascunho no catálogo ainda. Peça ao master para criar
                    cursos.
                  </td>
                </tr>
              ) : null}
              {catalog.map((c) => {
                const linked = activeByCourse.has(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                    </td>
                    <td>{c.categories.map((x) => x.category.name).join(', ')}</td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                    <td>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={linked}
                          disabled={busy}
                          onChange={() => void toggle(c.id, linked)}
                        />
                        {linked ? 'Sim' : 'Não'}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
