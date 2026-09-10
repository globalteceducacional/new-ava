'use client';

import { useParams } from 'next/navigation';
import { LessonView } from '@/components/course-view/LessonView';

/** Mesma tela de aula do aluno, com edição da aula, do vídeo e dos materiais. */
export default function ProfessorLessonPreviewPage() {
  const params = useParams<{ id: string; videoId: string }>();
  return (
    <LessonView
      videoId={params.videoId}
      editable
      courseHref={() => '/professor'}
      lessonHref={(videoId) => `/professor/cursos/${params.id}/aula/${videoId}`}
      activityHref={() => '/professor/correcoes'}
      quizHref={() => '/professor/correcoes'}
      communityBasePath="/professor/comunidade"
    />
  );
}
