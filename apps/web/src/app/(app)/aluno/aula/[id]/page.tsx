'use client';

import { useParams } from 'next/navigation';
import { LessonView } from '@/components/course-view/LessonView';

export default function AlunoAulaPage() {
  const params = useParams<{ id: string }>();
  return (
    <LessonView
      videoId={params.id}
      courseHref={() => '/aluno'}
      lessonHref={(videoId) => `/aluno/aula/${videoId}`}
      activityHref={(activityId) => `/aluno/atividade/${activityId}`}
      quizHref={(quizId) => `/aluno/quiz/${quizId}`}
    />
  );
}
