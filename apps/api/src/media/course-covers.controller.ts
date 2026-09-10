import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Readable } from 'stream';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MediaService } from './media.service';

/** Capa pública do curso (capa enviada ou poster da primeira aula). */
@Controller('course-covers')
export class CourseCoversPublicController {
  constructor(private readonly media: MediaService) {}

  @Get(':courseId')
  async get(@Param('courseId') courseId: string, @Res() res: Response) {
    const { body, contentType } = await this.media.streamCourseCover(courseId, {
      publishedOnly: true,
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (body instanceof Readable) {
      body.pipe(res);
      return;
    }
    res.send(body);
  }
}

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseCoverManageController {
  constructor(private readonly media: MediaService) {}

  /** Capa de rascunho/publicado para quem já pode ver o curso (cookie JWT). */
  @Get(':id/cover')
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  async streamForEditor(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { body, contentType } = await this.media.streamCourseCover(id, {
      publishedOnly: false,
      user,
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    if (body instanceof Readable) {
      body.pipe(res);
      return;
    }
    res.send(body);
  }

  @Post(':id/cover')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.uploadCourseCover(id, user, file);
  }

  @Delete(':id/cover')
  @Roles(RoleCode.ADM_MASTER, RoleCode.PROFESSOR)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.removeCourseCover(id, user);
  }
}
