'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { getStoredUser } from '@/lib/auth/session';

export default function Page() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setEnabled(Boolean(u?.hasSchool));
  }, []);

  return (
    <AppShell title="Notificações">
      <NotificationsPanel enabled={enabled} />
    </AppShell>
  );
}
