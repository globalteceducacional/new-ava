import { RoleCode } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: RoleCode;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
  role: RoleCode;
  institutionIds: string[];
  /** Pertence a escola real (não só catálogo livre AVA Aberto). */
  hasSchool: boolean;
  /** Tem foto de perfil no MinIO. */
  hasAvatar?: boolean;
  permissions: string[];
}
