'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CommunityThread } from '@/components/community/CommunityThread';

export default function MasterTopicoPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell title="Publicação" titleHref="/master/comunidade">
      <CommunityThread topicId={params.id} basePath="/master/comunidade" />
    </AppShell>
  );
}
