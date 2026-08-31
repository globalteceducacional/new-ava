import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InstitutionScopeGuard } from '../auth/guards/institution-scope.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from './dto/institution.dto';
import { InstitutionsService } from './institutions.service';

@Controller('institutions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstitutionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institutions: InstitutionsService,
  ) {}

  @Get()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  list(@CurrentUser() user: AuthUser) {
    return this.institutions.list(user);
  }

  @Post()
  @Roles(RoleCode.ADM_MASTER)
  create(@Body() dto: CreateInstitutionDto, @CurrentUser() user: AuthUser) {
    return this.institutions.create(dto, user);
  }

  /** Fixture de teste — ping com escopo de instituição. */
  @Get(':institutionId/ping')
  @UseGuards(InstitutionScopeGuard)
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  async ping(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const institution = await this.prisma.institution.findFirst({
      where: { id: institutionId, deletedAt: null },
      select: { id: true, slug: true, name: true },
    });

    return {
      ok: true,
      institution,
      caller: { id: user.id, role: user.role },
    };
  }

  @Get(':institutionId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  get(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.institutions.getById(institutionId, user);
  }

  @Patch(':institutionId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
  update(
    @Param('institutionId') institutionId: string,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.institutions.update(institutionId, dto, user);
  }

  @Delete(':institutionId')
  @Roles(RoleCode.ADM_MASTER)
  remove(
    @Param('institutionId') institutionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.institutions.softDelete(institutionId, user);
  }
}
