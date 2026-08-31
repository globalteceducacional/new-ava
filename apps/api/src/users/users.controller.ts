import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateUserDto,
  ListUsersQueryDto,
  LookupUsersQueryDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADM_MASTER, RoleCode.ADM_INSTITUICAO)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthUser) {
    return this.users.list(query, actor);
  }

  /** Lista enxuta para selects (ex.: escolher professor de um curso). */
  @Get('lookup')
  lookup(@Query() query: LookupUsersQueryDto, @CurrentUser() actor: AuthUser) {
    return this.users.lookup(query.role, query.institutionId, actor);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.getById(id, actor);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPassword(id, dto.password, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.softDelete(id, actor);
  }
}
