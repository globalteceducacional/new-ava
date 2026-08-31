'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CourseEditor } from '@/components/course-editor/CourseEditor';

function ProfessorEditorInner() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') ?? undefined;

  return (
    <CourseEditor
      mode={courseId ? 'edit' : 'create'}
      courseId={courseId}
      capabilities={{ canManageOffer: false, canPublish: true }}
      backHref="/professor"
      titleFallback="Editor de aulas"
    />
  );
}

export default function ProfessorEditorPage() {
  return (
    <Suspense fallback={null}>
      <ProfessorEditorInner />
    </Suspense>
  );
}
