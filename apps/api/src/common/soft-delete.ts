import type { Prisma } from '@prisma/client';

/** Marca soft-delete (nunca DELETE físico no fluxo normal). */
export function softDeleteData(deletedBy?: string | null): {
  deletedAt: Date;
  deletedBy: string | null;
} {
  return { deletedAt: new Date(), deletedBy: deletedBy ?? null };
}

/** Filtro padrão: exclui registros soft-deleted. */
export function notDeleted(): { deletedAt: null } {
  return { deletedAt: null };
}

export function userNotDeleted(): Prisma.UserWhereInput {
  return { deletedAt: null };
}
