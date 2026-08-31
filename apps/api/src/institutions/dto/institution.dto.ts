import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const INSTITUTION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class CreateInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @Transform(trim)
  name!: string;

  /** Opcional: derivado do nome quando ausente. */
  @IsOptional()
  @Matches(SLUG_PATTERN, {
    message: 'slug deve ter 2–50 caracteres: minúsculas, números e hífen',
  })
  @Transform(lower)
  slug?: string;

  @IsOptional()
  @IsIn(INSTITUTION_STATUSES)
  status?: (typeof INSTITUTION_STATUSES)[number];
}

export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @Matches(SLUG_PATTERN, {
    message: 'slug deve ter 2–50 caracteres: minúsculas, números e hífen',
  })
  @Transform(lower)
  slug?: string;

  @IsOptional()
  @IsIn(INSTITUTION_STATUSES)
  status?: (typeof INSTITUTION_STATUSES)[number];
}
