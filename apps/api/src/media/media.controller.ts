import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Endpoint interno do Caddy (forward_auth).
   * Valida ?token= na URI original antes de proxyar o objeto no MinIO.
   * Sem throttle: cada segmento HLS gera uma chamada.
   */
  @SkipThrottle()
  @Get('cdn-auth')
  async cdnAuth(
    @Headers('x-forwarded-uri') forwardedUri: string | undefined,
    @Query('token') tokenQuery: string | undefined,
    @Res() res: Response,
  ) {
    let token = tokenQuery;
    if (!token && forwardedUri) {
      try {
        token =
          new URL(forwardedUri, 'http://local').searchParams.get('token') ??
          undefined;
      } catch {
        token = undefined;
      }
    }
    const ok = await this.media.authorizeCdnRequest(forwardedUri, token);
    if (!ok) {
      res.status(401).send('Unauthorized');
      return;
    }
    res.status(200).send('OK');
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  @UseInterceptors(
    FileInterceptor('file', {
      // Disco temporário evita estourar RAM com vídeos grandes.
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, tmpdir()),
        filename: (_req, _file, cb) => cb(null, `ava-up-${randomUUID()}`),
      }),
      limits: {
        fileSize: Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 1073741824),
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('moduleVideoId') moduleVideoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.media.upload(file, moduleVideoId, user);
  }

  @Post('reprocess-course/:courseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  reprocessCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.media.reprocessCourse(courseId, user);
  }

  @Post(':id/reprocess')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  reprocess(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.reprocess(id, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.getById(id, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO, RoleCode.PROFESSOR)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.remove(id, user);
  }

  @Get(':id/playback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleCode.ADM_MASTER,
    RoleCode.ADM_INSTITUICAO,
    RoleCode.PROFESSOR,
    RoleCode.ALUNO,
  )
  playback(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.playback(id, user);
  }

  /** HLS: playlists/segmentos — alto volume; não entra no rate limit global. */
  @SkipThrottle()
  @Get(':id/hls/*path')
  async hls(
    @Param('id') id: string,
    @Param('path') assetPath: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const result = await this.media.streamHls(
      id,
      Array.isArray(assetPath) ? assetPath.join('/') : assetPath,
      token,
    );
    if (result.kind === 'redirect') {
      res.redirect(302, result.url);
      return;
    }
    if (result.contentType) res.setHeader('Content-Type', result.contentType);
    // Evita cache intermediário de playlist autenticada.
    res.setHeader('Cache-Control', 'private, no-store');
    if (result.body instanceof Readable) {
      result.body.pipe(res);
      return;
    }
    res.send(result.body);
  }
}
