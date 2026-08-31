import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleVideosService } from './module-videos.service';

@Controller('module-videos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModuleVideosController {
  constructor(private readonly lessons: ModuleVideosService) {}

  @Get(':id')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessons.getLesson(id, user);
  }
}
