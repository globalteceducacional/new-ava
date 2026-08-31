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
import {
  CreateModuleDto,
  CreateModuleVideoDto,
  CreateVideoMaterialDto,
  ReorderIdsDto,
  UpdateModuleDto,
  UpdateModuleVideoDto,
  UpdateVideoMaterialDto,
} from './dto/module.dto';
import { ModulesContentService } from './modules-content.service';

/**
 * Module = playlist de vídeos no curso.
 * NÃO confundir com nível (Iniciante/Avançado) — esses são Courses distintos.
 */
@Controller('courses/:courseId/modules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModulesContentController {
  constructor(private readonly modules: ModulesContentService) {}

  private static readonly STAFF = [
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
  ] as const;

  private static readonly ALL = [
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  ] as const;

  @Get()
  @Roles(...ModulesContentController.ALL)
  list(@Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.modules.list(courseId, user);
  }

  @Patch('reorder')
  @Roles(...ModulesContentController.STAFF)
  reorderModules(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderIdsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.reorderModules(courseId, dto, user);
  }

  @Get(':moduleId')
  @Roles(...ModulesContentController.ALL)
  get(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.get(courseId, moduleId, user);
  }

  @Post()
  @Roles(...ModulesContentController.STAFF)
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateModuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.createModule(courseId, dto, user);
  }

  @Patch(':moduleId')
  @Roles(...ModulesContentController.STAFF)
  updateModule(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.updateModule(courseId, moduleId, dto, user);
  }

  @Delete(':moduleId')
  @Roles(...ModulesContentController.STAFF)
  remove(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.softDeleteModule(courseId, moduleId, user);
  }

  @Post(':moduleId/videos')
  @Roles(...ModulesContentController.STAFF)
  addVideo(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateModuleVideoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.addVideo(courseId, moduleId, dto, user);
  }

  @Patch(':moduleId/videos/reorder')
  @Roles(...ModulesContentController.STAFF)
  reorderVideos(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: ReorderIdsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.reorderVideos(courseId, moduleId, dto, user);
  }

  @Patch(':moduleId/videos/:videoId')
  @Roles(...ModulesContentController.STAFF)
  updateVideo(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateModuleVideoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.updateVideo(courseId, moduleId, videoId, dto, user);
  }

  @Delete(':moduleId/videos/:videoId')
  @Roles(...ModulesContentController.STAFF)
  removeVideo(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('videoId') videoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.softDeleteVideo(courseId, moduleId, videoId, user);
  }

  @Post(':moduleId/videos/:videoId/materials')
  @Roles(...ModulesContentController.STAFF)
  addMaterial(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateVideoMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.addMaterial(courseId, moduleId, videoId, dto, user);
  }

  @Patch(':moduleId/videos/:videoId/materials/:materialId')
  @Roles(...ModulesContentController.STAFF)
  updateMaterial(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('videoId') videoId: string,
    @Param('materialId') materialId: string,
    @Body() dto: UpdateVideoMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.updateMaterial(
      courseId,
      moduleId,
      videoId,
      materialId,
      dto,
      user,
    );
  }

  @Delete(':moduleId/videos/:videoId/materials/:materialId')
  @Roles(...ModulesContentController.STAFF)
  removeMaterial(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('videoId') videoId: string,
    @Param('materialId') materialId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.modules.softDeleteMaterial(
      courseId,
      moduleId,
      videoId,
      materialId,
      user,
    );
  }
}
