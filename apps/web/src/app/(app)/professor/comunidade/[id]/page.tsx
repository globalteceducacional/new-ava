'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CommunityThread } from '@/components/community/CommunityThread';

export default function ProfessorTopicoPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell title="Publicação" titleHref="/professor/comunidade">
      <CommunityThread topicId={params.id} basePath="/professor/comunidade" />
    </AppShell>
  );
}
