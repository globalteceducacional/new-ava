'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CommunityThread } from '@/components/community/CommunityThread';

export default function InstituicaoTopicoPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell title="Publicação" titleHref="/instituicao/comunidade">
      <CommunityThread topicId={params.id} basePath="/instituicao/comunidade" />
    </AppShell>
  );
}
