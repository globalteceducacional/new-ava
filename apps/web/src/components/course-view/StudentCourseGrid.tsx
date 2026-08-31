'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StudentCourseCard } from '@/lib/course-view/student-courses';
import { filterStudentCourses, studentLessonHref } from '@/lib/course-view/student-courses';
import { getRecentCourseIds } from '@/lib/course-view/recent-courses';

type Props = {
  items: StudentCourseCard[];
  emptyMessage: string;
  /** Rótulo do badge quando enrolled (ex.: "Obrigatório" na grade). */
  enrolledLabel?: string;
  /** Badge para cursos sem matrícula (catálogo livre). */
  availableLabel?: string;
  /** Exibe a fileira "Vistos recentemente" no topo. */
  showRecent?: boolean;
};

function CourseTile({ item, badge }: { item: StudentCourseCard; badge: string }) {
  return (
    <a className="course-tile" href={studentLessonHref(item)}>
      <div className="course-tile-art">
        <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
          {badge}
        </span>
      </div>
      <div className="course-tile-body">
        <div className="small muted">
          {item.course.categories.map((c) => c.category.name).join(' · ')}
        </div>
        <h3 style={{ margin: '0.35rem 0' }}>{item.course.title}</h3>
        <p className="small" style={{ margin: 0 }}>
          {item.course.synopsis ?? 'Sem sinopse.'}
        </p>
      </div>
    </a>
  );
}

/** Grade de cards de curso do aluno, com busca e fileira de recentes. */
export function StudentCourseGrid({
  items,
  emptyMessage,
  enrolledLabel = 'Obrigatório',
  availableLabel = 'Disponível',
  showRecent = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(getRecentCourseIds());
  }, [items]);

  const filtered = useMemo(() => filterStudentCourses(items, query), [items, query]);
  const searching = Boolean(query.trim());

  const byId = useMemo(() => {
    const map = new Map<string, StudentCourseCard>();
    for (const item of items) map.set(item.course.id, item);
    return map;
  }, [items]);

  const recentItems = useMemo(() => {
    if (!showRecent || searching) return [];
    return recentIds
      .map((id) => byId.get(id))
      .filter((item): item is StudentCourseCard => Boolean(item));
  }, [showRecent, searching, recentIds, byId]);

  function badgeFor(item: StudentCourseCard) {
    return item.enrolled ? enrolledLabel : availableLabel;
  }

  return (
    <div>
      <div className="student-course-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou categoria"
          aria-label="Buscar cursos"
        />
      </div>

      {!filtered.length ? (
        <div className="alert alert-info">
          {searching ? 'Nenhum curso encontrado com essa busca.' : emptyMessage}
        </div>
      ) : (
        <div className="student-course-sections">
          {recentItems.length ? (
            <section className="student-course-section">
              <h2 className="student-course-section-title">Vistos recentemente</h2>
              <div className="grid-3">
                {recentItems.map((item) => (
                  <CourseTile key={`recent-${item.course.id}`} item={item} badge={badgeFor(item)} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="student-course-section">
            {recentItems.length ? (
              <h2 className="student-course-section-title">
                {searching ? 'Resultados' : 'Todos os cursos'}
              </h2>
            ) : null}
            <div className="grid-3">
              {filtered.map((item) => (
                <CourseTile key={item.course.id} item={item} badge={badgeFor(item)} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
