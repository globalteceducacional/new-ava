export type StudentCourseCard = {
  enrolled?: boolean;
  firstVideoId: string | null;
  course: {
    id: string;
    title: string;
    synopsis: string | null;
    status: string;
    categories: Array<{ category: { name: string } }>;
  };
};

/** Abre o curso: a página encaminha para a playlist (e matricula se preciso). */
export function studentLessonHref(item: StudentCourseCard): string {
  return `/aluno/cursos/${item.course.id}`;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Filtra por título, sinopse ou categoria (tag). */
export function filterStudentCourses<T extends StudentCourseCard>(items: T[], query: string): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = normalizeSearch(
      [
        item.course.title,
        item.course.synopsis ?? '',
        ...item.course.categories.map((c) => c.category.name),
      ].join(' '),
    );
    return haystack.includes(needle);
  });
}
