import { RoleCode, UserStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Username: minúsculas, números, ponto, hífen e underscore. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  @Transform(lower)
  email!: string;

  @Matches(USERNAME_PATTERN, {
    message:
      'username deve ter 3–32 caracteres: letras minúsculas, números, ponto, hífen ou underscore',
  })
  @Transform(lower)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsEnum(RoleCode)
  role!: RoleCode;

  /** Instituições do usuário. Obrigatório para todos os papéis exceto ADM_MASTER. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  institutionIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  @Transform(lower)
  email?: string;

  @IsOptional()
  @Matches(USERNAME_PATTERN, {
    message:
      'username deve ter 3–32 caracteres: letras minúsculas, números, ponto, hífen ou underscore',
  })
  @Transform(lower)
  username?: string;

  @IsOptional()
  @IsEnum(RoleCode)
  role?: RoleCode;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  institutionIds?: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

/** Dados que o próprio usuário pode alterar no perfil. */
export class UpdateSelfDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  @Transform(lower)
  email?: string;

  @IsOptional()
  @Matches(USERNAME_PATTERN, {
    message:
      'username deve ter 3–32 caracteres: letras minúsculas, números, ponto, hífen ou underscore',
  })
  @Transform(lower)
  username?: string;
}

/** Troca de senha pelo próprio usuário (exige a senha atual). */
export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}

export class LookupUsersQueryDto {
  @IsEnum(RoleCode)
  role!: RoleCode;

  @IsOptional()
  @IsString()
  institutionId?: string;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(RoleCode)
  role?: RoleCode;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  institutionId?: string;

  /** Busca por nome, email ou username. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
