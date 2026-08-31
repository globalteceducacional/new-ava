'use client';

import { useParams } from 'next/navigation';
import { CourseView } from '@/components/course-view/CourseView';

/** Admin abre o curso na visão do aluno, com edição do conteúdo existente. */
export default function MasterCourseDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CourseView
      courseId={params.id}
      editable
      fullEditorHref={`/master/catalogo/${params.id}/editor`}
      backHref="/master/catalogo"
      backLabel="Catálogo"
      lessonHref={(videoId) => `/master/catalogo/${params.id}/aula/${videoId}`}
    />
  );
}
