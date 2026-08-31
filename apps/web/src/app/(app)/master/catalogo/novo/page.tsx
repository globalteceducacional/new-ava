'use client';

import { CourseEditor } from '@/components/course-editor/CourseEditor';

export default function NovoCursoPage() {
  return (
    <CourseEditor
      mode="create"
      capabilities={{ canManageOffer: true, canPublish: true }}
      backHref="/master/catalogo"
      titleFallback="Novo curso"
    />
  );
}
