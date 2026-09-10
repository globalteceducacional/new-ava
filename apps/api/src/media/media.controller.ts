import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MEDIA_COOKIE,
  MediaService,
  mediaTokenFromCookieHeader,
} from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Endpoint interno do Caddy (forward_auth).
   * Cookie HttpOnly `ava_media` ou ?token= legado.
   */
  @SkipThrottle()
  @Get('cdn-auth')
  async cdnAuth(
    @Headers('x-forwarded-uri') forwardedUri: string | undefined,
    @Headers('x-original-uri') originalUri: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') tokenQuery: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ) {
    const uri = forwardedUri || originalUri;
    let token = tokenQuery;
    if (!token && authorization?.toLowerCase().startsWith('bearer ')) {
      token = authorization.slice(7).trim();
    }
    if (!token && uri) {
      try {
        token =
          new URL(uri, 'http://local').searchParams.get('token') ?? undefined;
      } catch {
        token = undefined;
      }
    }
    if (!token) token = mediaTokenFromCookieHeader(cookieHeader);
    const ok = await this.media.authorizeCdnRequest(uri, token);
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
  playback(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.media.playback(id, user).then((result) => {
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(MEDIA_COOKIE, result.token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
        maxAge: result.ttlMs,
      });
      return {
        mediaId: result.mediaId,
        status: result.status,
        playlistUrl: result.playlistUrl,
        expiresIn: result.expiresIn,
      };
    });
  }

  /** HLS: playlists/segmentos — alto volume; não entra no rate limit global. */
  @SkipThrottle()
  @Get(':id/hls/*path')
  async hls(
    @Param('id') id: string,
    @Param('path') assetPath: string,
    @Query('token') tokenQuery: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const token =
      tokenQuery ||
      (typeof req.cookies?.[MEDIA_COOKIE] === 'string'
        ? req.cookies[MEDIA_COOKIE]
        : undefined);
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
