import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { UsersService } from './users.service';

/** Foto de perfil pública (sem auth) — usada no sidebar e perfil. */
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly users: UsersService) {}

  @Get(':userId')
  async get(@Param('userId') userId: string, @Res() res: Response) {
    const { body, contentType } = await this.users.streamAvatar(userId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (body instanceof Readable) {
      body.pipe(res);
      return;
    }
    res.send(body);
  }
}
