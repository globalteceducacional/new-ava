import { Suspense } from 'react';
import { InstituicaoUsuariosPageClient } from './InstituicaoUsuariosPageClient';

export default function InstituicaoUsuariosPage() {
  return (
    <Suspense fallback={null}>
      <InstituicaoUsuariosPageClient />
    </Suspense>
  );
}
