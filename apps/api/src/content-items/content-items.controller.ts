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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ContentItemsService } from './content-items.service';
import {
  CreateContentItemDto,
  ReorderContentItemsDto,
  UpdateContentItemDto,
} from './dto/content-item.dto';

@Controller('courses/:courseId/content-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContentItemsController {
  constructor(private readonly contentItems: ContentItemsService) {}

  @Get()
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.contentItems.list(courseId, user);
  }

  @Post()
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateContentItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.create(courseId, dto, user);
  }

  @Patch('reorder')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  reorder(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderContentItemsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.reorder(courseId, dto, user);
  }

  @Patch(':itemId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  update(
    @Param('courseId') courseId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateContentItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.update(courseId, itemId, dto, user);
  }

  @Delete(':itemId')
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  remove(
    @Param('courseId') courseId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentItems.softDelete(courseId, itemId, user);
  }
}
