import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangeOwnPasswordDto, UpdateSelfDto } from './dto/user.dto';
import { UsersService } from './users.service';

/**
 * Perfil do usuário autenticado (qualquer papel).
 * Rota dedicada para não conflitar com /users/:id (admin).
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentUser() actor: AuthUser) {
    return this.users.getSelf(actor);
  }

  @Patch()
  async update(@CurrentUser() actor: AuthUser, @Body() dto: UpdateSelfDto) {
    const profile = await this.users.updateSelf(actor, dto);
    return {
      profile,
      user: sessionUserFrom(actor, profile),
    };
  }

  @Post('password')
  changePassword(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ChangeOwnPasswordDto,
  ) {
    return this.users.changeOwnPassword(actor, dto);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const profile = await this.users.uploadAvatar(actor, file);
    return {
      profile,
      user: sessionUserFrom(actor, profile),
    };
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUser() actor: AuthUser) {
    const profile = await this.users.removeAvatar(actor);
    return {
      profile,
      user: sessionUserFrom(actor, profile),
    };
  }
}

function sessionUserFrom(
  actor: AuthUser,
  profile: {
    email: string;
    username: string;
    name: string;
    hasAvatar: boolean;
  },
) {
  return {
    id: actor.id,
    email: profile.email,
    username: profile.username,
    name: profile.name,
    role: actor.role,
    institutionIds: actor.institutionIds,
    permissions: actor.permissions,
    hasSchool: actor.hasSchool,
    hasAvatar: profile.hasAvatar,
  };
}
