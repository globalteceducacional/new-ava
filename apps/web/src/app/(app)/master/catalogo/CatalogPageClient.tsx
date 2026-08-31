'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/auth/api';
import {
  COURSE_STATUS_LABELS,
  type Category,
  type Course,
  type CourseStatus,
} from '@/lib/admin/types';
import { errorMessage } from '@/lib/format';

const STATUS_BADGE: Record<CourseStatus, string> = {
  DRAFT: 'badge badge-warn',
  PUBLISHED: 'badge badge-ok',
  ARCHIVED: 'badge',
};

/** Comparação sem acento (ex.: "matematica" acha "Matemática"). */
function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function CatalogPageClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CourseStatus | ''>('');
  const [courseQuery, setCourseQuery] = useState('');

  const [catName, setCatName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, crs] = await Promise.all([
        apiFetch<Category[]>('/categories'),
        apiFetch<Course[]>('/courses'),
      ]);
      setCategories(cats);
      setCourses(crs);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar o catálogo'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    try {
      await action();
      setError(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    const name = catName.trim();
    if (!name) return;
    await run(async () => {
      await apiFetch('/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setCatName('');
      setNotice(`Categoria "${name}" criada.`);
    }, 'Não foi possível criar a categoria');
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    const name = categoryName.trim();
    await run(async () => {
      await apiFetch(`/categories/${editingCategory.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setNotice(`Categoria renomeada para "${name}".`);
      setEditingCategory(null);
    }, 'Não foi possível renomear a categoria');
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Excluir a categoria "${category.name}"?`)) return;
    await run(async () => {
      await apiFetch(`/categories/${category.id}`, { method: 'DELETE' });
      setNotice(`Categoria "${category.name}" excluída.`);
    }, 'Não foi possível excluir a categoria');
  }

  async function changeStatus(course: Course, action: string, label: string) {
    await run(async () => {
      await apiFetch(`/courses/${course.id}/${action}`, { method: 'PATCH' });
      setNotice(`"${course.title}" — ${label}.`);
    }, 'Não foi possível alterar o status do curso');
  }

  async function deleteCourse(course: Course) {
    const ok = window.confirm(
      `Excluir o curso "${course.title}"? Ele deixa de aparecer para alunos e professores.`,
    );
    if (!ok) return;
    await run(async () => {
      await apiFetch(`/courses/${course.id}`, { method: 'DELETE' });
      setNotice(`Curso "${course.title}" excluído.`);
    }, 'Não foi possível excluir o curso');
  }

  const visibleCourses = useMemo(() => {
    const needle = normalizeSearch(courseQuery);
    return courses.filter((course) => {
      if (statusFilter && course.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = normalizeSearch(
        [
          course.title,
          course.synopsis ?? '',
          ...course.categories.map((c) => c.category.name),
          ...course.teachers.map((t) => t.user.name),
        ].join(' '),
      );
      return haystack.includes(needle);
    });
  }, [courses, courseQuery, statusFilter]);

  return (
    <AppShell title="Catálogo pedagógico">
      <div className="page-header">
        <div>
          <p className="eyebrow">Gestão global</p>
          <h1>Categorias e cursos</h1>
          <p>
            O catálogo é independente das instituições: um curso é criado aqui e depois vinculado a
            quem vai oferecê-lo.
          </p>
        </div>
        <Link className="btn btn-primary" href="/master/catalogo/novo">
          + Novo curso
        </Link>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="panel-head">
          <h2>Cursos</h2>
        </div>
        <div className="toolbar">
          <input
            value={courseQuery}
            onChange={(e) => setCourseQuery(e.target.value)}
            placeholder="Buscar por nome, categoria ou professor"
            aria-label="Buscar cursos"
            style={{ minWidth: 280, flex: 1, maxWidth: 420 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CourseStatus | '')}
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            <option value="PUBLISHED">Publicados</option>
            <option value="DRAFT">Rascunhos</option>
            <option value="ARCHIVED">Arquivados</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Categorias</th>
                <th>Professores</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleCourses.map((course) => (
                <tr key={course.id}>
                  <td className="catalog-course-cell">
                    <Link href={`/master/catalogo/${course.id}`}>
                      <strong>{course.title}</strong>
                    </Link>
                    {course.synopsis ? (
                      <div className="small muted catalog-course-synopsis">{course.synopsis}</div>
                    ) : null}
                  </td>
                  <td className="small">
                    {course.categories.map((c) => c.category.name).join(', ')}
                  </td>
                  <td className="small">
                    {course.teachers.length === 0 ? (
                      <span className="badge badge-warn">Sem professor</span>
                    ) : (
                      course.teachers.map((t) => t.user.name).join(', ')
                    )}
                  </td>
                  <td>
                    <span className={STATUS_BADGE[course.status]}>
                      {COURSE_STATUS_LABELS[course.status]}
                    </span>
                  </td>
                  <td className="catalog-actions-cell">
                    <div className="catalog-actions">
                      <Link className="btn btn-ghost btn-sm" href={`/master/catalogo/${course.id}`}>
                        Gerenciar
                      </Link>
                      {course.status === 'PUBLISHED' ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() =>
                            void changeStatus(course, 'unpublish', 'voltou para rascunho')
                          }
                        >
                          Despublicar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => void changeStatus(course, 'publish', 'publicado')}
                        >
                          Publicar
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        disabled={busy}
                        onClick={() => void deleteCourse(course)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? <div className="empty-state">Carregando…</div> : null}
        {!loading && visibleCourses.length === 0 ? (
          <div className="empty-state">
            {courseQuery.trim() || statusFilter
              ? 'Nenhum curso encontrado com esses filtros.'
              : 'Nenhum curso cadastrado.'}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Categorias</h2>
        </div>
        <form onSubmit={createCategory} className="toolbar">
          <input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Nome da nova categoria"
            required
            style={{ minWidth: 260 }}
          />
          <button className="btn btn-secondary btn-sm" type="submit" disabled={busy}>
            + Categoria
          </button>
        </form>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Slug</th>
                <th>Cursos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const usage = courses.filter((c) =>
                  c.categories.some((x) => x.category.id === category.id),
                ).length;
                return (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                    </td>
                    <td>
                      <code>{category.slug}</code>
                    </td>
                    <td>{usage}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditingCategory(category);
                            setCategoryName(category.name);
                          }}
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busy || usage > 0}
                          title={
                            usage > 0
                              ? 'Remova a categoria dos cursos antes de excluí-la'
                              : undefined
                          }
                          onClick={() => void deleteCategory(category)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && categories.length === 0 ? (
          <div className="empty-state">Nenhuma categoria cadastrada.</div>
        ) : null}
      </div>

      <Modal
        open={editingCategory !== null}
        title="Renomear categoria"
        onClose={() => setEditingCategory(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditingCategory(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>
              Salvar
            </button>
          </>
        }
      >
        <form id="category-form" onSubmit={saveCategory}>
          <div className="field">
            <label htmlFor="category-name">Nome</label>
            <input
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
