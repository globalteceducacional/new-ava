'use client';

import { useParams } from 'next/navigation';
import { CourseEditor } from '@/components/course-editor/CourseEditor';

export default function MasterCourseEditorPage() {
  const params = useParams<{ id: string }>();
  return (
    <CourseEditor
      mode="edit"
      courseId={params.id}
      capabilities={{ canManageOffer: true, canPublish: true }}
      backHref={`/master/catalogo/${params.id}`}
    />
  );
}
