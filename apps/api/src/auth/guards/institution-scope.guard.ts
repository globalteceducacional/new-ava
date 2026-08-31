import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AuthService } from '../auth.service';
import type { AuthUser } from '../auth.types';

/**
 * Valida que o :institutionId da rota pertence ao usuário (Master bypass).
 */
@Injectable()
export class InstitutionScopeGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: { institutionId?: string; id?: string };
    }>();
    const user = request.user;
    if (!user) return false;

    if (user.role === RoleCode.ADM_MASTER) return true;

    const institutionId =
      request.params.institutionId ?? request.params.id ?? undefined;
    if (!institutionId) return true;

    this.authService.assertInstitutionAccess(user, institutionId);
    return true;
  }
}
