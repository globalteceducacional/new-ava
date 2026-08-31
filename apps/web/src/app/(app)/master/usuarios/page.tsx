import { Suspense } from 'react';
import { UsuariosPageClient } from './UsuariosPageClient';

export default function MasterUsuariosPage() {
  // useSearchParams exige boundary de Suspense na build estática do Next.
  return (
    <Suspense fallback={null}>
      <UsuariosPageClient />
    </Suspense>
  );
}
