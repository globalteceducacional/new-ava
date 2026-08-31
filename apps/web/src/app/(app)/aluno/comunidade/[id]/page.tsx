'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CommunityThread } from '@/components/community/CommunityThread';

export default function AlunoTopicoPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell title="Publicação" titleHref="/aluno/comunidade">
      <CommunityThread topicId={params.id} basePath="/aluno/comunidade" />
    </AppShell>
  );
}
