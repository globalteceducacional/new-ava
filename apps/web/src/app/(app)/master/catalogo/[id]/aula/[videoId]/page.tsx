'use client';

import { useParams } from 'next/navigation';
import { LessonView } from '@/components/course-view/LessonView';

/** Mesma tela que o aluno vê, com edição da aula, do vídeo e dos materiais. */
export default function MasterLessonPage() {
  const params = useParams<{ id: string; videoId: string }>();
  return (
    <LessonView
      videoId={params.videoId}
      editable
      courseHref={() => `/master/catalogo/${params.id}`}
      lessonHref={(videoId) => `/master/catalogo/${params.id}/aula/${videoId}`}
      activityHref={(activityId) => `/aluno/atividade/${activityId}`}
      quizHref={(quizId) => `/aluno/quiz/${quizId}`}
    />
  );
}
