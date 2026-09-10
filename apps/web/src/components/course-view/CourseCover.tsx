'use client';

import { useState, type ReactNode } from 'react';
import { courseCoverUrl } from '@/lib/course-view/course-cover';

type Props = {
  courseId: string;
  className?: string;
  cacheKey?: string | number;
  /** Editor: capa de rascunho via rota autenticada. */
  authenticated?: boolean;
  children?: ReactNode;
};

/** Área de capa: imagem do curso ou fundo padrão se ainda não houver arquivo. */
export function CourseCover({
  courseId,
  className,
  cacheKey,
  authenticated = false,
  children,
}: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={className}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={courseCoverUrl(courseId, cacheKey, authenticated)}
          alt=""
          className="course-cover-img"
          {...(authenticated ? { crossOrigin: 'use-credentials' as const } : {})}
          onError={() => setFailed(true)}
        />
      ) : null}
      {children}
    </div>
  );
}
